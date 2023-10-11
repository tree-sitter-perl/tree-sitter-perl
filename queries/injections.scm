; an injections.scm file for nvim-treesitter
((comment) @injection.content
 (#set! injection.language "comment"))
 
((pod) @injection.content
 (#set! injection.language "pod"))

(
  (substitution_regexp
    (replacement) @injection.content
    ; match if there's a single `e` in the modifiers list
    (substitution_regexp_modifiers) @modifiers (#match? @modifiers "e")
  )
  (#set! injection.language "perl")
)
