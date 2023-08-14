use 5.014;
# <- include
#   ^ number
use v5.14;
# <- include
#   ^ number
use v5;
# <- include
#   ^ number
use strict;
# <- include
#   ^ type
use List::Util 1.23;
# <- include
#   ^^^^^^^^^^ type
#              ^ number
123 if 45;
#   ^ conditional
123 unless 45;
#   ^ conditional
123 while 45;
#   ^ repeat
123 until 45;
#   ^ repeat
123 for 45;
#   ^ repeat
123 foreach 45;
#   ^ repeat
if(1) { 123; } elsif(2) { 456; } else { 789; }
# <- conditional
#              ^ keyword
#                                ^ keyword
unless(1) { 123; }
# <- conditional
while(1) { 123; }
# <- repeat
until(1) { 123; }
# <- repeat
for (1, 2, 3) { 456; }
# <- repeat
foreach (1, 2, 3) { 456; }
# <- repeat
for $V (1, 2, 3) { 456; }
# <- repeat
#   ^ variable.scalar
foreach $V (1, 2, 3) { 456; }
# <- repeat
#       ^ variable.scalar
for my $x (1, 2, 3) { 456; }
# <- repeat
#   ^ keyword
#      ^ variable.scalar
foreach my $x (1, 2, 3) { 456; }
# <- repeat
#       ^ keyword
#          ^ variable.scalar
for (my $i = 0; $i < 10; $i++) { 123; }
# <- repeat
#    ^ keyword
#       ^ variable.scalar
#               ^ variable.scalar
#                        ^ variable.scalar
package AAA;
# <- keyword
#       ^ type
package BBB 1.23;
# <- keyword
#       ^ type
#           ^ number
package CCC { }
# <- keyword
#       ^ type
package DDD 4.56 { }
# <- keyword
#       ^ type
#           ^ number
FOO: 123;
# <- label
#    ^^^ number
LOOP: foreach(@list) {
# <- label
#     ^ keyword
   next LOOP;
#  ^ keyword
#       ^ label
}
ITEM: while(@items) {
# <- label
#     ^ keyword
   last ITEM;
#  ^ keyword
#       ^ label
}
goto FOO;
# <- keyword
#    ^ label
BEGIN { 123; }
# <- keyword.phaser
#       ^ number
END { 456; }
# <- keyword.phaser
#     ^ number
