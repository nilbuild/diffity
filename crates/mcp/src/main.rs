struct Args {
    #[allow(dead_code)]
    socket: Option<String>,
    #[allow(dead_code)]
    token: Option<String>,
}

fn parse_args() -> Args {
    let mut socket = None;
    let mut token = None;
    let mut it = std::env::args().skip(1);
    while let Some(arg) = it.next() {
        match arg.as_str() {
            "--socket" => socket = it.next(),
            "--token" => token = it.next(),
            _ => {}
        }
    }
    Args { socket, token }
}

// TODO(agents workstream): rmcp stdio server proxying tool calls over the unix socket.
fn main() {
    let _args = parse_args();
}
