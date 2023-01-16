foo();
# <- function
foo(123);
# <- function
#   ^ number
foo(12, 34);
# <- function
#   ^ number
#       ^ number
$obj->meth;
# <- variable.scalar
#     ^ function.method
$obj->meth();
# <- variable.scalar
#     ^ function.method
$obj->meth(123);
# <- variable.scalar
#     ^ function.method
#          ^ number
$obj->meth(12, 34);
# <- variable.scalar
#     ^ function.method
#          ^ number
#              ^ number
Some::Module->new(1234);
# <- type
#             ^ function.method
#                 ^ number
