1 or 2;
# <- number
# ^ operator
#    ^ number
1 and 2;
# ^ operator
12 eq 34;
#  ^ operator
12 eq 34 eq 45;
#        ^ operator
12 cmp 34;
#  ^ operator
12 isa 34;
#  ^ operator
%hash = (foo => "bar", shift => 'thing', qq => 'thing');
# <- variable.hash
#        ^^^ string.special
#               ^^^^^ string
#                      ^^^^^ string.special
#                                        ^^ string.special
