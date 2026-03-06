fn main() {
    // 当前端构建产物变化时，强制 Cargo 重新编译以嵌入最新资源
    println!("cargo:rerun-if-changed=../dist");
    tauri_build::build()
}
