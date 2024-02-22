#! /usr/bin/env perl

use feature ':5.38';
use Path::Tiny qw/path/;
use Unicode::UCD 'prop_invlist';

# prop_invlist returns an array whos odd indices start the include section, and the even
# ones represent the stop. we invert these list so they represent NOT having the quality
my @non_words    = ( 0, prop_invlist('Word'),         0x10FFFF );
my @non_start    = ( 0, prop_invlist('XID_Start'),    0x10FFFF );
my @non_continue = ( 0, prop_invlist('XID_Continue'), 0x10FFFF );

use List::Util   qw/pairmap uniq/;
use Range::Merge qw/merge/;

# we merge the ranges here, so we see all codepoints that don't have the prop
sub merge_with_non_words (@interested_range) {
    my $merged =
      merge( [ pairmap { [ $a => $b ] } @non_words, @interested_range ] );

    # and now we flip it back!
    shift $merged->[0]->@*;
    pop $merged->[-1]->@*;
    my @final = map $_->@*, $merged->@*;
    return @final;
}

sub render_array (@range_pairs) {
    my $rendered = join "\n", '{',
      join( ",\n", pairmap { "  { $a, $b }" } @range_pairs ), '}';
}
my @idstart    = merge_with_non_words(@non_start);
my @idcont     = merge_with_non_words(@non_continue);
my @whitespace = prop_invlist 'White_Space';

path('./src/tsp_unicode.h')->spew(<<C);
/* THIS FILE IS GENERATED BY unicode_ranges.pl */
#include <stdlib.h>
#include <stdint.h>
#include <stdbool.h>

struct TSPRange { int32_t start; int32_t end; };
static int tsprange_contains (const void * a, const void * b) {
  struct TSPRange * range = (struct TSPRange*)b;
  int32_t key = *(int32_t*)a;
  if (key < range->start)
    return -1;
  if (key >= range->end)
    return 1;
  return 0;
}

static struct TSPRange tsp_id_start[] = ${\render_array @idstart};

bool is_tsp_id_start (int codepoint) {
  return bsearch(&codepoint, tsp_id_start, sizeof(tsp_id_start) / sizeof(struct TSPRange), sizeof(struct TSPRange), tsprange_contains);
}

static struct TSPRange tsp_id_continue[] = ${\render_array @idcont};

bool is_tsp_id_continue (int codepoint) {
  return bsearch(&codepoint, tsp_id_continue, sizeof(tsp_id_continue) / sizeof(struct TSPRange), sizeof(struct TSPRange), tsprange_contains);
}

static struct TSPRange tsp_whitespace[] = ${\render_array @whitespace};
bool is_tsp_whitespace (int codepoint) {
  return bsearch(&codepoint, tsp_whitespace, sizeof(tsp_whitespace) / sizeof(struct TSPRange), sizeof(struct TSPRange), tsprange_contains);
}
C

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
#
# ACTUALLY - the simplest thing to do is make a struct that holds the ends of the range +
# stick them into an array which we can just bsearch; by all means that's the simplest
# thing
