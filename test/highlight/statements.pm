123 if 45;
#   ^ keyword
123 unless 45;
#   ^ keyword
123 while 45;
#   ^ keyword
123 until 45;
#   ^ keyword
123 for 45;
#   ^ keyword
123 foreach 45;
#   ^ keyword
if(1) { 123; } elsif(2) { 456; } else { 789; }
# <- keyword
#              ^ keyword
#                                ^ keyword
unless(1) { 123; }
# <- keyword
while(1) { 123; }
# <- keyword
until(1) { 123; }
# <- keyword
for (1, 2, 3) { 456; }
# <- keyword
foreach (1, 2, 3) { 456; }
# <- keyword
for $V (1, 2, 3) { 456; }
# <- keyword
#   ^ variable
foreach $V (1, 2, 3) { 456; }
# <- keyword
#       ^ variable
for my $x (1, 2, 3) { 456; }
# <- keyword
#   ^ keyword
#      ^ variable
foreach my $x (1, 2, 3) { 456; }
# <- keyword
#       ^ keyword
#          ^ variable
for (my $i = 0; $i < 10; $i++) { 123; }
# <- keyword
#    ^ keyword
#       ^ variable
#               ^ variable
#                        ^ variable
use 5.014;
# <- keyword
#   ^ number
use v5.14;
# <- keyword
#   ^ number
use strict;
# <- keyword
#   ^ type
use List::Util 1.23;
# <- keyword
#   ^^^^^^^^^^ type
#              ^ number
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
