# block form
map { +"\L$_"  => 1 } @array;
# <- keyword
map { ; "\L$_" => 1 } @array;
# <- keyword
map { ( "\L$_" => 1 ) } @array;
# <- keyword
map { lc($_) => 1 } @array;
# <- keyword

grep { ok($_) } @array;
# <- keyword

# expr form
map +( lc($_) => 1 ), @array;
# <- keyword
map +{ lc($_) => 1 }, @array;
# <- keyword
map { "\L$_"   => 1 }, @array;
# <- keyword

grep ok($_), @array;
# <- keyword

map { lc($_) => 1 } 1, 2, 3;
# <- keyword
map +(lc($_) => 1 ), 1, 2, 3;
# <- keyword
map { lc($_) => 1 } (1, 2, 3);
# <- keyword
map +(lc($_) => 1 ), (1, 2), 3;
# <- keyword
