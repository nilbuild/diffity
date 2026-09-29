//! Centres the macOS traffic lights in our custom title bar.
//!
//! `trafficLightPosition` only offsets the buttons inside AppKit's own title bar, and AppKit resets
//! them whenever it rebuilds that title bar (resize, fullscreen, losing key, theme change, moving
//! between displays). Instead the three buttons are moved into a plain container view pinned to the
//! top-left with autoresizing masks, which AppKit lays out like any other view and leaves alone.

use objc2::rc::Retained;
use objc2::{ClassType, MainThreadMarker, MainThreadOnly};
use objc2_app_kit::{NSAutoresizingMaskOptions, NSView, NSWindow, NSWindowButton};
use objc2_foundation::{NSPoint, NSRect, NSSize};

/// Matches `h-11` on `TitleBar` and the welcome screen's top bar.
pub const TITLEBAR_HEIGHT: f64 = 44.0;

/// Distance between the buttons' left edges (AppKit's standard layout).
const BUTTON_STRIDE: f64 = 20.0;

fn is_container(view: &NSView, window_width: f64) -> bool {
    view.class() == NSView::class() && view.bounds().size.width < window_width
}

/// Idempotent: every call puts the three buttons into one container pinned to the top-left and lays them out
/// from scratch, whatever AppKit did to them in between (it resets their frames or reclaims them after focus
/// changes, Space switches, sleep and title-bar rebuilds, which is what collapsed them to a single green dot).
pub fn center<R: tauri::Runtime>(window: &tauri::Window<R>) {
    let Some(mtm) = MainThreadMarker::new() else {
        let window = window.clone();
        let _ = window.clone().run_on_main_thread(move || center(&window));
        return;
    };

    let Ok(handle) = window.ns_window() else {
        return;
    };
    if handle.is_null() {
        return;
    }
    let ns_window: &NSWindow = unsafe { &*handle.cast::<NSWindow>() };
    let window_width = ns_window.frame().size.width;

    let buttons: Vec<_> = [
        NSWindowButton::CloseButton,
        NSWindowButton::MiniaturizeButton,
        NSWindowButton::ZoomButton,
    ]
    .into_iter()
    .filter_map(|kind| ns_window.standardWindowButton(kind))
    .collect();
    if buttons.len() != 3 {
        return;
    }

    let mut titlebar: Option<Retained<NSView>> = None;
    let mut container: Option<Retained<NSView>> = None;
    for button in &buttons {
        let Some(parent) = (unsafe { button.superview() }) else {
            continue;
        };
        if is_container(&parent, window_width) {
            if titlebar.is_none() {
                titlebar = unsafe { parent.superview() };
            }
            if container.is_none() {
                container = Some(parent);
            }
            continue;
        }
        if titlebar.is_none() {
            titlebar = Some(parent);
        }
    }
    let Some(titlebar) = titlebar else {
        return;
    };

    let size = buttons[0].frame().size;
    let height = size.height;
    let width = BUTTON_STRIDE * 2.0 + size.width;
    let inset = (TITLEBAR_HEIGHT - height) / 2.0;
    let rect = NSRect::new(
        NSPoint::new(inset, titlebar.bounds().size.height - TITLEBAR_HEIGHT / 2.0 - height / 2.0),
        NSSize::new(width, height),
    );

    let container = match container {
        Some(existing) => existing,
        None => {
            for view in titlebar.subviews().iter() {
                if is_container(&view, window_width) && view.subviews().is_empty() {
                    view.removeFromSuperview();
                }
            }
            let created = NSView::initWithFrame(NSView::alloc(mtm), rect);
            created.setAutoresizingMask(
                NSAutoresizingMaskOptions::ViewMinYMargin | NSAutoresizingMaskOptions::ViewMaxXMargin,
            );
            titlebar.addSubview(&created);
            created
        }
    };

    let mut repaired = Vec::new();
    if !rect_eq(container.frame(), rect) {
        repaired.push(format!("container {:?}", container.frame()));
        container.setFrame(rect);
    }
    for (index, button) in buttons.iter().enumerate() {
        let in_container = unsafe { button.superview() }
            .is_some_and(|parent| std::ptr::eq(&*parent as *const NSView, &*container as *const NSView));
        if !in_container {
            repaired.push(format!("button {index} reclaimed by AppKit"));
            button.removeFromSuperview();
            container.addSubview(button);
        }
        let wanted = NSRect::new(NSPoint::new(BUTTON_STRIDE * index as f64, 0.0), size);
        if !rect_eq(button.frame(), wanted) {
            repaired.push(format!("button {index} frame {:?}", button.frame()));
            button.setFrame(wanted);
        }
        if button.isHidden() {
            repaired.push(format!("button {index} hidden"));
            button.setHidden(false);
        }
    }
    if !repaired.is_empty() {
        tracing::info!(target: "traffic_lights", "repaired: {}", repaired.join(", "));
    }

    center_strays(&titlebar, Some(&container));
}

fn rect_eq(a: NSRect, b: NSRect) -> bool {
    (a.origin.x - b.origin.x).abs() < 0.5
        && (a.origin.y - b.origin.y).abs() < 0.5
        && (a.size.width - b.size.width).abs() < 0.5
        && (a.size.height - b.size.height).abs() < 0.5
}

/// Brings other title-bar subviews (e.g. the screen-sharing indicator) down to the same row.
fn center_strays(titlebar: &NSView, skip: Option<&NSView>) {
    let middle = titlebar.bounds().size.height - TITLEBAR_HEIGHT / 2.0;

    for view in titlebar.subviews().iter() {
        if skip.is_some_and(|ours| std::ptr::eq(&*view as *const NSView, ours as *const NSView)) {
            continue;
        }

        let mut frame = view.frame();
        let wanted = middle - frame.size.height / 2.0;
        if (frame.origin.y - wanted).abs() < 0.5 {
            continue;
        }

        frame.origin.y = wanted;
        view.setFrame(frame);
    }
}
