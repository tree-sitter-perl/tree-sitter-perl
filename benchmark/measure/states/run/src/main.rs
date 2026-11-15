fn main() {
    let a: Vec<String> = std::env::args().collect();
    let json = std::fs::read_to_string(&a[1]).unwrap();
    let (_name, c) = tree_sitter_generate::generate_parser_for_grammar(&json, Some((0, 26, 0))).unwrap();
    std::fs::write(&a[2], c).unwrap();
}
