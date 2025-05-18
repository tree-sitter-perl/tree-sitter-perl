import XCTest
import SwiftTreeSitter
import TreeSitterPerl

final class TreeSitterPerlTests: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_perl())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading Perl grammar")
    }
}
