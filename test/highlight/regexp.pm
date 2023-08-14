qr/pattern/;
# <- string.regex
qr/pattern with (parens)/;
# <- string.regex
qr/pattern with $interpolation/;
# <- string.regex
#               ^ variable.scalar
qr'pattern with no $interpolation';
# <- string.regex
qr/pattern/i;
# ^^^^^^^^^^ string.regex

m/pattern/;
# <- string.regex
m/pattern with (parens)/;
# <- string.regex
m/pattern with $interpolation/;
# <- string.regex
#               ^ variable.scalar
m'pattern with no $interpolation';
# <- string.regex
m/pattern/i;
# ^^^^^^^^^^ string.regex
m/^anchored pattern$/;
# ^^^^^^^^^^^^^^^^^^ string.regex
m/^pattern(?:$|,)/;
# ^^^^^^^^^^^^^^^ string.regex
