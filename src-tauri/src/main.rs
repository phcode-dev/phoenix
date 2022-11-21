//use std::fs::File;
///use flate2::read::GzDecoder;
//use tar::Archive;
use std::process::Command;

use std::{thread, time};
use std::time::Instant;
use port_scanner::scan_port;


#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}!", name)
}

#[tauri::command]
fn greet1(name: &str) -> String {
    let before = Instant::now();
   // extract();
    // let handle = thread::spawn(||
    //     {
    //         start_server();
    //     }
    // );
    // let mut x = 0;
    // loop {
    //     thread::sleep(time::Duration::from_millis(1));
    //     x = x +1;
    //     if scan_port(8000) {
    //         break;
    //     }
    // }
    // println!("Elapsed time: {:.2?}", before.elapsed());
    // println!("x {}",x);
    //
    // println!("is port open {}", scan_port(8000));
    // println!("printing1");
    // println!("Elapsed time: {:.2?}", before.elapsed());
    format!("Hello1, {}!", name)

}

fn extract() -> Result<(), std::io::Error> {
    download_lp::download("https://nodejs.org/dist/v18.12.1/node-v18.12.1-linux-x64.tar.xz", "/home/charly/");
    let path = "/home/charly/node-v18.12.1-linux-x64.tar.xz";
    //
    // let tar_gz = File::open(path)?;
    // let tar = GzDecoder::new(tar_gz);
    // let mut archive = Archive::new(tar);
    // archive.unpack("/home/charly/")?;

    let mut list_dir = Command::new("tar");
    list_dir.arg("-xvf").arg("/home/charly/node-v18.12.1-linux-x64.tar.xz").arg("-C").arg("/home/charly/repo/phoenix");
    let hello_1 = list_dir.output().expect("failed to execute process");


    Ok(())
}

fn start_server() {
    println!("printing2");
    let mut npm = Command::new("/home/charly/repo/phoenix/node-v18.12.1-linux-x64/bin/npm");
    npm.arg("run").arg("serve").arg("--prefix").arg("/home/charly/repo/phoenix");
    let out = npm.output().expect("failed to execute process");
    assert_eq!(out.stdout, b"hello world");
}

fn main() {
    let before = Instant::now();
    let handle = thread::spawn(||
        {
            start_server();
        }
    );
    let mut x = 0;
    loop {
        thread::sleep(time::Duration::from_millis(1));
        x = x +1;
        if scan_port(8000) {
            break;
        }
    }
    println!("Elapsed time: {:.2?}", before.elapsed());
    println!("x {}",x);

    println!("is port open {}", scan_port(8000));
    println!("printing1");
    println!("Elapsed time: {:.2?}", before.elapsed());
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![greet, greet1])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

}
