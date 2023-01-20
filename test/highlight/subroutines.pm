sub foo
# <- keyword
#   ^ function
{
   123;
#  ^ number
}

sub { $x++ };
# <- keyword
#     ^ variable.scalar

sub abc :lvalue { }
# <- keyword
#        ^ decorator
sub def :lvalue const {}
# <- keyword
#        ^ decorator
#               ^ decorator
sub ghi :lvalue :const { }
# <- keyword
#        ^ decorator
#                ^ decorator
