### Numbers
1234;
# <- number

### Strings
'hello';
# <- string
'a\'string';
# <- string
# ^^ string
'a\\string';
# <- string
# ^^ string.special
'\n is literal';
# <- string
#^^ string  # not string.special
'a string with a final \\';
# <- string
#                      ^^ string.special

q(hello);
# <- string
q(a 'string');
# <- string
q(a (string) here);
# <- string

"hello";
# <- string
"a\"string";
# <- string
# ^^ string.special
"a\\string";
# <- string
# ^^ string.special
"a string w/ a final \\";
#                    ^^ string.special
# <- string
"a string with\nlinefeed";
# <- string
#             ^^ string.special

qq(hello);
# <- string
qq(a 'string');
# <- string
qq(a (string) here);
# <- string

"with $scalar";
# <- string
#     ^^^^^^^ variable
"with @array";
# <- string
#     ^^^^^^ variable
