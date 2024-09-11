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
#      ^^^^^ string              ^^^ string
"$thing->{time}";
#        ^ punctuation.bracket
#         ^^ string.special
