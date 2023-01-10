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
