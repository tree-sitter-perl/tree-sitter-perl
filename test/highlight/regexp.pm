qr/pattern/;
# <- string.regexp
qr/pattern with (parens)/;
# <- string.regexp
qr/pattern with $interpolation/;
# <- string.regexp
#               ^ variable.scalar
qr'pattern with no $interpolation';
# <- string.regexp
qr/pattern/i;
# ^^^^^^^^^^ string.regexp

m/pattern/;
# <- string.regexp
m/pattern with (parens)/;
# <- string.regexp
m/pattern with $interpolation/;
# <- string.regexp
#               ^ variable.scalar
m'pattern with no $interpolation';
# <- string.regexp
m/pattern/i;
# ^^^^^^^^^^ string.regexp
m/^anchored pattern$/;
# ^^^^^^^^^^^^^^^^^^ string.regexp
m/^pattern(?:$|,)/;
# ^^^^^^^^^^^^^^^ string.regexp
