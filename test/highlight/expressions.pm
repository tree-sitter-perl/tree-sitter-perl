do { 123; };
# <- keyword
#    ^ number
require 123;
# <- keyword
#       ^ number
require;
# <- keyword
next;
# <- keyword
last LOOP;
# <- keyword
redo;
# <- keyword
goto LABEL;
# <- keyword
undef;
# <- keyword
undef $var;
# <- keyword
#     ^ variable.scalar
local $var;
# <- keyword
#     ^ variable.scalar
