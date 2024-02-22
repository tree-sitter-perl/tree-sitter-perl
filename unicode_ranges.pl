#! /usr/bin/env perl

use Unicode::UCD 'prop_invlist';

# prop_invlist returns an array whos odd indices start the include section, and the even
# ones represent the stop. we invert these list so they represent NOT having the quality
my @non_words    = ( 0, prop_invlist('Word'),         0x10FFFF );
my @non_start    = ( 0, prop_invlist('XID_Start'),    0x10FFFF );
my @non_continue = ( 0, prop_invlist('XID_Continue'), 0x10FFFF );

use List::Util   qw/pairmap uniq/;
use Range::Merge qw/merge/;

# we merge the ranges here, so we see all codepoints that don't have the prop
my $merged = merge( [ pairmap { [ $a => $b ] } @non_words, @non_start ] );

# and now we flip it back!
shift $merged->[0]->@*;
pop $merged->[-1]->@*;
my @final = map $_->@*, $merged->@*;

# okay, our next step is gonna be making a data structure to keep our shtuff in.
# it sounds like we can use an augmented tree as per
# https://tildesites.bowdoin.edu/~ltoma/teaching/cs231/fall07/Lectures/augtrees.pdf where
# we use the range as each node's value. this allows us to descend the tree doing a binary
# search
# here's some more writing on RB trees (specifically in the linux kernel)
# https://www.kernel.org/doc/Documentation/rbtree.txt
# we can also explore a more direct interval tree impl
#   https://en.wikipedia.org/wiki/Interval_tree
#
# In addition, for the JS, we need to generate ranges for the regex
