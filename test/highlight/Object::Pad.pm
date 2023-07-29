use Object::Pad;
class Example1 {
   field $x = __CLASS__->default_x;
#             ^^^^^^^^^ function.builtin
}
class Example2 {
   ADJUSTPARAMS { }
#  ^^^^^^^^^^^^ keyword.phaser
}
role Example3 { }
# <- include
#    ^^^^^^^^ type
