 "$+";
# ^^ variable.scalar
 "$(";
# ^^ variable.scalar
 "$!";
# ^^ variable.scalar
 "@+";
# ^^ variable.array
 "@-";
# ^^ variable.array

 "@(";
# ^^ string
 "@)";
# ^^ string
"$thing-> {ting}    also $shtuff ->{hi}";
#      ^^^^^ string
#                                 ^^^ string
"$thing->{time}";
#      ^^ punctuation.delimiter
#        ^ punctuation.bracket
#         ^^ string.special
