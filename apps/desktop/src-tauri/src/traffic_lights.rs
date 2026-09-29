//! Centres the macOS traffic lights in our custom title bar.
//!
//! `trafficLightPosition` only offsets the buttons inside AppKit's own title bar, and AppKit resets
//! them whenever it rebuilds that title bar (resize, fullscreen, losing key, theme change, moving
//! between displays). Instead the three buttons are moved into a plain container view pinned to the
//! top-left with autoresizing masks, which AppKit lays out like any other view and leaves alone.

use std::sync::OnceLock;

use objc2::{ClassType, MainThreadMarker, MainThreadOnly};
use objc2_app_kit::{NSAutoresizingMaskOptions, NSView, NSWindow, NSWindowButton};

/// The buttons' frames inside our container, captured the first time we move them. AppKit sometimes resets the
/// buttons' origins while they live in our container (after sleep, Space switches, occlusion changes), which stacks
/// all three at x = 0 so only the green one is visible; every pass puts them back.
static BUTTON_FRAMES: OnceLock<[(f64, f64); 3]> = OnceLock::new();

/// Matches `h-11` on `TitleBar` and the welcome screen's top bar.
pub const TITLEBAR_HEIGHT: f64 = 44.0;

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

    let buttons: Vec<_> = [
        NSWindowButton::CloseButton,
        NSWindowButton::MiniaturizeButton,
        NSWindowButton::ZoomButton,
    ]
    .into_iter()
    .filter_map(|kind| ns_window.standardWindowButton(kind))
    .collect();

    let (Some(close), Some(zoom)) = (buttons.first(), buttons.last()) else {
        return;
    };
    let Some(parent) = (unsafe { close.superview() }) else {
        return;
    };

    // Still inside our container from a previous pass: restore the buttons' own frames (AppKit may have reset them)
    // and realign whatever AppKit added since.
    if parent.bounds().size.width < ns_window.frame().size.width {
        if let Some(frames) = BUTTON_FRAMES.get() {
            for (button, (x, y)) in buttons.iter().zip(frames.iter()) {
                let mut frame = button.frame();
                if (frame.origin.x - x).abs() > 0.5 || (frame.origin.y - y).abs() > 0.5 {
                    frame.origin.x = *x;
                    frame.origin.y = *y;
                    button.setFrame(frame);
                }
                button.setHidden(false);
            }
        }
        if let Some(titlebar) = unsafe { parent.superview() } {
            center_strays(&titlebar, Some(&parent));
        }
        return;
    }

    let titlebar = parent;

    // AppKit took the buttons back, leaving our old (empty) container behind.
    for view in titlebar.subviews().iter() {
        if view.class() == NSView::class() {
            view.removeFromSuperview();
        }
    }

    let close_frame = close.frame();
    let zoom_frame = zoom.frame();
    let inset = (TITLEBAR_HEIGHT - close_frame.size.height) / 2.0;
    let center_from_bottom = titlebar.bounds().size.height - TITLEBAR_HEIGHT / 2.0;

    let mut rect = close_frame;
    rect.origin.x = inset - close_frame.origin.x;
    rect.origin.y = center_from_bottom - close_frame.size.height / 2.0 - close_frame.origin.y;
    rect.size.width = zoom_frame.origin.x + zoom_frame.size.width;
    rect.size.height = close_frame.origin.y + close_frame.size.height;

    let container = NSView::initWithFrame(NSView::alloc(mtm), rect);
    container.setAutoresizingMask(
        NSAutoresizingMaskOptions::ViewMinYMargin | NSAutoresizingMaskOptions::ViewMaxXMargin,
    );
    titlebar.addSubview(&container);

    let mut frames = [(0.0, 0.0); 3];
    for (index, button) in buttons.iter().enumerate() {
        let frame = button.frame();
        button.removeFromSuperview();
        container.addSubview(button);
        button.setFrame(frame);
        if let Some(slot) = frames.get_mut(index) {
            *slot = (frame.origin.x, frame.origin.y);
        }
    }
    if buttons.len() == 3 {
        let _ = BUTTON_FRAMES.set(frames);
    }

    center_strays(&titlebar, Some(&container));
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
