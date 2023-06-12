### Numbers
1234;
# <- number

### Strings
'hello';
# <- string
'a\'string';
# <- string
# ^^ string.special
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
#     ^^^^^^^ variable.scalar
"with @array";
# <- string
#     ^^^^^^ variable.array

### Quoted Word Lists
qw( a b c );
# <- string
qw();
# <- string
qw/ 1 2 /;
# <- string
qw/ literal\nslash-n /;
# <- string
qw/ literal \n slash-n /;
# <- string
qw| double escape \\|;
# <- string
#                 ^^ string.special
qw/ hello \/ goodbye /;
# <- string
#         ^^ string.special
q # this is a comment
#  ^ comment
#<- string
  (string content);
#  ^ string

`command`;
# <- string
`command with $scalar`;
# <- string
#             ^ variable.scalar
qx(command);
# <- string
