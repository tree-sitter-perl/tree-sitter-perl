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
