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

### FUNC0OPs
# no need to test them all, just do a few
__FILE__;
# <- function.builtin
__LINE__;
# <- function.builtin
wait;
# <- function.builtin
time();
# <- function.builtin

### FUNC1OPs
defined $x;
# <- function.builtin
#       ^ variable.scalar
int($num);
# <- function.builtin
#   ^ variable.scalar
shift @arr;
# <- function.builtin
#     ^ variable.array
keys %hash
# <- function.builtin
#    ^ variable.hash
