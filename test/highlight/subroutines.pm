sub foo
# <- keyword.function
#   ^ function
{
   123;
#  ^ number
}

sub { $x++ };
# <- keyword.function
#     ^ variable.scalar

sub abc :lvalue { }
# <- keyword.function
#        ^ decorator
sub def :lvalue const {}
# <- keyword.function
#        ^ decorator
#               ^ decorator
sub ghi :lvalue :const { }
# <- keyword.function
#        ^ decorator
#                ^ decorator
#
sub abc :lvalue(1234) { }
#               ^^^^ string
