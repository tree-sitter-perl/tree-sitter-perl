$s; @a; %h;
# <- variable
#   ^ variable
#       ^ variable
$one + $two;
# <- variable
#      ^ variable
my $var;
# <- keyword
#  ^ variable
$sref->$*;
# <- variable
#    ^^^^ variable
$aref->@*;
# <- variable
#    ^^^^ variable
$href->%*;
# <- variable
#    ^^^^ variable
$arr[ 123 ];
# <- variable
# ^^ variable
#   ^ variable
#     ^^^ number
#         ^ variable
$aref->[ 123 ];
# <- variable
#    ^^^ variable
#        ^^^ number
#            ^ variable
$hash{ key };
# <- variable
# ^^^ variable
#    ^ variable
#      ^^^ string.special
#          ^ variable
$href->{ key };
# <- variable
#    ^^^ variable
#        ^^^ string.special
#            ^ variable
$aref->[ 123 ]{ 456 }[ 789 ];
# <- variable
#    ^^^ variable
#        ^^^ number
#            ^ variable
#             ^ variable
#               ^^^ number
#                   ^ variable
#                    ^ variable
#                      ^^^ number
#                          ^ variable
