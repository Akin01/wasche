use qrcode::render::svg;
use qrcode::QrCode;
use std::env;

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        eprintln!("Usage: gen_qr <data> [output_path]");
        return;
    }
    let data = &args[1];
    let output_path = args.get(2).map(|s| s.as_str()).unwrap_or("qr.html");

    let code = QrCode::new(data.as_bytes()).expect("Failed to build QR");
    let svg = code
        .render::<svg::Color>()
        .min_dimensions(320, 320)
        .build();

    let html = format!(
        r#"<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>WhatsApp Web Pairing</title>
  <style>
    body {{
      background: #111b21;
      color: #e9edef;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
    }}
    .card {{
      background: #ffffff;
      padding: 24px;
      border-radius: 16px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
    }}
    h1 {{
      margin-top: 0;
      margin-bottom: 8px;
      font-size: 24px;
    }}
    p {{
      color: #8696a0;
      margin-top: 0;
      margin-bottom: 24px;
      font-size: 14px;
    }}
  </style>
</head>
<body>
  <h1>Scan with WhatsApp</h1>
  <p>1. Open WhatsApp &gt; Settings &gt; Linked Devices &gt; Link a Device<br>2. Point camera at this QR code</p>
  <div class="card">
    {}
  </div>
</body>
</html>"#,
        svg
    );

    std::fs::write(output_path, html).expect("Failed to write HTML");
    println!("Successfully generated HTML QR to: {}", output_path);
}
