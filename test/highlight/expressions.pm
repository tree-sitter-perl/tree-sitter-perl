do { 123; };
# <- keyword
#    ^ number
require 123;
# <- include
#       ^ number
require;
# <- include
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
return;
# <- keyword.return
return 1, 2, 3;
# <- keyword.return
#      ^ number
