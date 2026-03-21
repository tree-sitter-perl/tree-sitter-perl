package tree_sitter_perl_test

import (
	"testing"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	tree_sitter_perl "github.com/tree-sitter-perl/tree-sitter-perl/bindings/go"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(tree_sitter_perl.Language())
	if language == nil {
		t.Errorf("Error loading Perl grammar")
	}
}
