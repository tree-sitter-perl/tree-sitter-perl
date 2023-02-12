#include <tree_sitter/parser.h>

/* Set this to #define instead to enable debug printing */
#define DEBUGGING

/* for debug */
#ifdef DEBUGGING
#  include <stdio.h>
#  define DEBUG(fmt,...)  fprintf(stderr, "scanner.c:%d DEBUG: " fmt, __LINE__, __VA_ARGS__)
#else
#  define DEBUG(fmt,...)
#endif

#include <string.h>
#define streq(a,b)  (strcmp(a,b)==0)

#include <wctype.h>

enum TokenType {
  /* non-ident tokens */
  TOKEN_APOSTROPHE,
  TOKEN_DOUBLE_QUOTE,
  TOKEN_BACKTICK,
  PERLY_SEMICOLON,
  PERLY_BRACE_OPEN,
  TOKEN_HASHBRACK,
  /* immediates */
  TOKEN_QUOTELIKE_BEGIN,
  TOKEN_QUOTELIKE_END,
  TOKEN_Q_STRING_CONTENT,
  TOKEN_QQ_STRING_CONTENT,
  TOKEN_QW_LIST_CONTENT,
  TOKEN_ESCAPE_SEQUENCE,
  TOKEN_ESCAPED_DELIMITER,
  TOKEN_POD,
  TOKEN_GOBBLED_CONTENT,
  TOKEN_ATTRIBUTE_VALUE,
  TOKEN_PROTOTYPE_OR_SIGNATURE,
  TOKEN_HEREDOC_DELIM,
  TOKEN_COMMAND_HEREDOC_DELIM,
  TOKEN_HEREDOC_START,
  TOKEN_HEREDOC_MIDDLE,
  TOKEN_HEREDOC_END,
  /* zero-width lookahead tokens */
  TOKEN_CHEQOP_CONT,
  TOKEN_CHRELOP_CONT,
  /* zero-width high priority token */
  TOKEN_NONASSOC,
  /* error condition is always last */
  TOKEN_ERROR
};

#define HEREDOC_TOKEN_LEN 8
/* this is a arbitrary string where we only care about the first HEREDOC_TOKEN_LEN chars */
struct TSString {
  int length;
  int contents[HEREDOC_TOKEN_LEN];
}

/* we record the length, b/c that's still relevant for our cheapo comparison */
static void TSString_push(TSString *s, int c)
{
  if (s->length++ < HEREDOC_TOKEN_LEN)
    s->contents[s->length] = c
}

static bool TSString_eq(TSString *s1, TSString *s2)
{
  return (s1->length == s2->length) 
    && (memcmp(s1, s2, s1->length < HEREDOC_TOKEN_LEN ? s1->length : HEREDOC_TOKEN_LEN) == 0)
}

struct LexerState {
  int delim_open, delim_close;  /* codepoints */
  int delim_count;
  /* heredoc - we need to track if we should start the heredoc, if it's interpolating,
   * how many chars the delimeter is and what the delimeter is */
  bool should_heredoc, heredoc_interpolates, heredoc_indents;
  TSString heredoc_delim;
};


#define ADVANCE_C \
  do {                                         \
    if(lexer->lookahead == '\r')               \
      DEBUG("> advance U+%04X = \\r\n",        \
          lexer->lookahead);                   \
    else if(lexer->lookahead == '\n')          \
      DEBUG("> advance U+%04X = \\n\n",        \
          lexer->lookahead);                   \
    else                                       \
      DEBUG("> advance U+%04X = '%c'\n",       \
          lexer->lookahead, lexer->lookahead); \
    lexer->advance(lexer, false);              \
    c = lexer->lookahead;                      \
  } while(0)

#define TOKEN(type) \
  do {                            \
    DEBUG("token(%s)\n", #type);  \
    lexer->result_symbol = type;  \
    return true;                  \
  } while(0)

static void skip_whitespace(TSLexer *lexer)
{
  while(1) {
    int c = lexer->lookahead;
    if(!c)
      return;
    if(iswspace(c))
      lexer->advance(lexer, true);
      /* continue */
    else
      return;
  }
}

static void _skip_chars(TSLexer *lexer, int maxlen, const char *allow)
{
  int c = lexer->lookahead;

  while(maxlen)
    if(!c)
      return;
    else if(strchr(allow, c)) {
      ADVANCE_C;
      if(maxlen > 0)
        maxlen--;
    }
    else
      break;
}
#define skip_hexdigits(lexer, maxlen)  _skip_chars(lexer, maxlen, "0123456789ABCDEFabcdef")
#define skip_digits(lexer, maxlen)     _skip_chars(lexer, maxlen, "0123456789")
#define skip_octdigits(lexer, maxlen)  _skip_chars(lexer, maxlen, "01234567")

static void skip_braced(TSLexer *lexer)
{
  int c = lexer->lookahead;

  if(c != '{')
    return;

  ADVANCE_C;
  while(c && c != '}')
    ADVANCE_C;

  ADVANCE_C;
}

static int close_for_open(int c)
{
  switch(c) {
    case '(': return ')';
    case '[': return ']';
    case '{': return '}';
    case '<': return '>';
    /* TODO: Add aaaaalll the Unicode ones */
    default:
      return 0;
  }
}

static bool isidfirst(int c)
{
  // TODO: More Unicode in here
  return c == '_' || iswalpha(c);
}

static bool isidcont(int c)
{
  // TODO: More Unicode in here
  return isidfirst(c) || iswdigit(c);
}

void *tree_sitter_perl_external_scanner_create()
{
  return malloc(sizeof(struct LexerState));
}

void tree_sitter_perl_external_scanner_destroy(void *payload)
{
  free(payload);
}

void tree_sitter_perl_external_scanner_reset(void *payload) {}

unsigned int tree_sitter_perl_external_scanner_serialize(void *payload, char *buffer)
{
  struct LexerState *state = payload;

  unsigned int n = sizeof(struct LexerState);
  memcpy(buffer, state, n);
  return n;
}

void tree_sitter_perl_external_scanner_deserialize(void *payload, const char *buffer, unsigned int n)
{
  struct LexerState *state = payload;

  memcpy(state, buffer, n);
}

/* Longest identifier name we ever care to look specifically for (excluding
 * terminating NUL)
 */
#define MAX_IDENT_LEN 2

bool tree_sitter_perl_external_scanner_scan(
  void *payload,
  TSLexer *lexer,
  const bool *valid_symbols
) {
  struct LexerState *state = payload;

  bool is_ERROR = valid_symbols[TOKEN_ERROR];
  bool is_continue_op = valid_symbols[TOKEN_CHEQOP_CONT] || valid_symbols[TOKEN_CHRELOP_CONT];
  bool skipped_whitespace = false;

  int c = lexer->lookahead;

  if(!is_ERROR && valid_symbols[TOKEN_GOBBLED_CONTENT]) {
    while (!lexer->eof(lexer)) 
      ADVANCE_C;

    TOKEN(TOKEN_GOBBLED_CONTENT);
  }

  /* heredocs override everything, so they must be here before */
  if(valid_symbols[TOKEN_HEREDOC_START]) {
    if(state->should_heredoc && lexer->get_column(lexer) == 0) {
      DEBUG("Heredoc started...\n", 0);
      state->should_heredoc = false;
      TOKEN(TOKEN_HEREDOC_START);
    }
  }


  if(valid_symbols[TOKEN_ATTRIBUTE_VALUE]) {
    /* the '(' must be immediate, before any whitespace */
    if(c == '(') {
      DEBUG("Attribute value started...\n", 0);

      ADVANCE_C;

      int delimcount = 0;
      while(!lexer->eof(lexer)) {
        if(c == '\\') {
          ADVANCE_C;
          /* ignore the next char */
        }
        else if(c == '(')
          delimcount++;
        else if(c == ')') {
          if(delimcount)
            delimcount--;
          else {
            ADVANCE_C;
            break;
          }
        }

        ADVANCE_C;
      }

      TOKEN(TOKEN_ATTRIBUTE_VALUE);
    }
  }

  bool allow_identalike = false;
  /* disabling for now, b/c we moved identalikes into the DSL
  for(int sym = 0; sym <= TOKEN_Q_STRING_BEGIN; sym++)
    if(valid_symbols[sym]) {
      allow_identalike = true;
      break;
    }
  */

  if (iswspace(c)) {
    skipped_whitespace = true;
    skip_whitespace(lexer);
    c = lexer->lookahead;
  }

  if(valid_symbols[PERLY_SEMICOLON]) {
    if(c == ';') {
      ADVANCE_C;

      TOKEN(PERLY_SEMICOLON);
    }
    if(c == '}' || lexer->eof(lexer)) {
      DEBUG("Fake PERLY_SEMICOLON at end-of-scope\n", 0);
      // no advance

      TOKEN(PERLY_SEMICOLON);
    }
  }

  if((valid_symbols[PERLY_BRACE_OPEN] || valid_symbols[TOKEN_HASHBRACK]) && c == '{') {
    /* Encountered '{' while at least one of theabove was valid */
    ADVANCE_C;

    /* PERLY_BRACE_OPEN is only valid during the start of a statement; if
     * that's valid here then we prefer that over HASHBRACK */
    if(valid_symbols[PERLY_BRACE_OPEN]) {
      TOKEN(PERLY_BRACE_OPEN);
    }
    else {
      TOKEN(TOKEN_HASHBRACK);
    }
  }

  int ident_len = 0;
  char ident[MAX_IDENT_LEN+1];
  if(allow_identalike && isidfirst(c)) {
    /* All the identifiers we care about are US-ASCII */
    ident[0] = c;
    ident[1] = 0;
    ident_len++;
    ADVANCE_C;

    while(c && isidcont(c)) {
      if(ident_len < MAX_IDENT_LEN) {
        ident[ident_len] = c;
        ident[ident_len+1] = 0;
      }

      ADVANCE_C;
      ident_len++;
    }
    if(ident_len) {
      DEBUG("IDENT \"%.*s\"\n", ident_len, ident);
    }
  }

  bool begins_backslash = (c == '\\');

  /* We can't "un-advance" this backslash if TOKEN_ESCAPED_DELIMITER didn't want it
   * to leave it for TOKEN_QW_LIST_CONTENT, so we'll have to eat it now and
   * remember that we did so for all of them
   */
  if(begins_backslash &&
      (valid_symbols[TOKEN_ESCAPE_SEQUENCE] ||
       valid_symbols[TOKEN_ESCAPED_DELIMITER] ||
       valid_symbols[TOKEN_QW_LIST_CONTENT])
  )
    ADVANCE_C;

  if(valid_symbols[TOKEN_APOSTROPHE] && c == '\'') {
    ADVANCE_C;
    state->delim_open = 0;
    state->delim_close = '\'';
    state->delim_count = 0;

    TOKEN(TOKEN_APOSTROPHE);
  }
  if(valid_symbols[TOKEN_DOUBLE_QUOTE] && c == '"') {
    ADVANCE_C;
    state->delim_open = 0;
    state->delim_close = '"';
    state->delim_count = 0;

    TOKEN(TOKEN_DOUBLE_QUOTE);
  }
  if(valid_symbols[TOKEN_BACKTICK] && c == '`') {
    ADVANCE_C;
    state->delim_open = 0;
    state->delim_close = '`';
    state->delim_count = 0;

    TOKEN(TOKEN_BACKTICK);
  }

  if(valid_symbols[TOKEN_POD]) {
    int column = lexer->get_column(lexer);
    if(column == 0 && c == '=') {
      DEBUG("POD started...\n", 0);

      /* Keep going until the linefeed after a line beginning `=cut` */
      static const char *cut_marker = "=cut";
      int stage = -1;

      while(!lexer->eof(lexer)) {
        if(c == '\r')
          ; /* ignore */
        else if(stage < 1 && c == '\n')
          stage = 0;
        else if(stage >= 0 && stage < 4 && c == cut_marker[stage])
          stage++;
        else if(stage == 4 && (c == ' ' || c == '\t'))
          stage = 5;
        else if(stage == 4 && c == '\n')
          stage = 6;
        else
          stage = -1;

        if(stage > 4)
          break;

        ADVANCE_C;
      }
      if(stage < 6)
        while(!lexer->eof(lexer)) {
          if(c == '\n')
            break;

          ADVANCE_C;
        }
      /* If we got this far then either we reached stage 6, or we're at EOF */
      TOKEN(TOKEN_POD);
    }
  }

  /* By now if we haven't recognised the token we shouldn't attempt to look
   * for the remaining ones when in an error condition */
  if(is_ERROR)
    return false;

  if(valid_symbols[TOKEN_HEREDOC_MIDDLE]) {

  }
  /* we use this to force tree-sitter to stay on the error branch of a nonassoc operator */
  if(valid_symbols[TOKEN_NONASSOC])
    TOKEN(TOKEN_NONASSOC);

  if(valid_symbols[TOKEN_HEREDOC_DELIM] || valid_symbols[TOKEN_COMMAND_HEREDOC_DELIM]) {
    // by default, indentation is false
    bool should_indent = false;
    if(!skipped_whitespace) {
      if(c == '~') {
        ADVANCE_C;
        should_indent = true;
      } 
      if(isidfirst(c)) {
        int i = 0;
        while(isidcont(c)) {
          if(i < HEREDOC_TOKEN_LEN) {
            state->heredoc_delim[i++] = c;
          }
          ADVANCE_C;
        }
        state->heredoc_delim_length = i;
        state->heredoc_delim[i] = 0;
        state->heredoc_interpolates = true;
        state->heredoc_indents = should_indent;
        state->should_heredoc = true;
        TOKEN(TOKEN_HEREDOC_DELIM);
      }
    }
    if(c == '\'' || c == '"' || c == '`') {
      int delim_open = c;
      int i = 0;
      ADVANCE_C;
      while (c != delim_open) {
        // backslashes escape the quote char
        if(c == '\\') {
          int to_add = c;
          ADVANCE_C;
          if(c == delim_open) {
            to_add = delim_open;
            ADVANCE_C;
          }
          if(i <= HEREDOC_TOKEN_LEN) {
            state->heredoc_delim[i++] = to_add;
          }
        } else if(i <= HEREDOC_TOKEN_LEN) {
          state->heredoc_delim[i++] = c;
          ADVANCE_C;
        }
      }
      if(i > 0) {
        // gotta eat that delimeter
        ADVANCE_C;
        // gotta null terminate up in here
        state->heredoc_delim_length = i;
        state->heredoc_delim[i+1] = 0;
        state->heredoc_interpolates = delim_open != '\'';
        state->should_heredoc = true;
        if(delim_open == '`')
          TOKEN(TOKEN_COMMAND_HEREDOC_DELIM);
        TOKEN(TOKEN_HEREDOC_DELIM);
      }
      // TODO - handling for quoted variants; if it's unspaced it falls thru to here

    }
  }

  if(valid_symbols[TOKEN_QUOTELIKE_BEGIN]) {
      if (skipped_whitespace && c == '#')
        return false;

      int delim_close = close_for_open(lexer->lookahead);
      if(delim_close) {
        state->delim_open  = lexer->lookahead;
        state->delim_close = delim_close;
      }
      else {
        state->delim_open  = 0;
        state->delim_close = lexer->lookahead;
      }
      state->delim_count = 0;

      ADVANCE_C;

      DEBUG("Generic QSTRING open='%c' close='%c'\n", state->delim_open, state->delim_close);
      TOKEN(TOKEN_QUOTELIKE_BEGIN);
  }

  if(valid_symbols[TOKEN_ESCAPED_DELIMITER] && begins_backslash) {
    if(c == state->delim_open || c == state->delim_close) {
      ADVANCE_C;
      TOKEN(TOKEN_ESCAPED_DELIMITER);
    }
  }

  if(valid_symbols[TOKEN_ESCAPE_SEQUENCE] && begins_backslash) {
    int esc_c = c;
    ADVANCE_C;

    // Inside any kind of string, \\ is always an escape sequence
    if(esc_c == '\\')
      TOKEN(TOKEN_ESCAPE_SEQUENCE);

    if(valid_symbols[TOKEN_Q_STRING_CONTENT]) {
      // Inside a q() string, only \\ is a valid escape sequence; all else is literal
      TOKEN(TOKEN_Q_STRING_CONTENT);
    }
    if(valid_symbols[TOKEN_QW_LIST_CONTENT]) {
      // Inside a qw() list, only \\ is a valid escape sequence; all else is literal
      TOKEN(TOKEN_QW_LIST_CONTENT);
    }

    switch(esc_c) {
      case 'x':
        if(c == '{')
          skip_braced(lexer);
        else
          skip_hexdigits(lexer, 2);
        break;

      case 'N':
        skip_braced(lexer);
        break;

      case 'o':
        /* TODO: contents should just be octal */
        skip_braced(lexer);
        break;

      case '0':
        skip_octdigits(lexer, 3);
        break;

      default:
        break;
    }

    TOKEN(TOKEN_ESCAPE_SEQUENCE);
  }

  if(valid_symbols[TOKEN_Q_STRING_CONTENT] || valid_symbols[TOKEN_QQ_STRING_CONTENT]) {
    bool is_qq = valid_symbols[TOKEN_QQ_STRING_CONTENT];
    bool valid = false;

    while(c) {
      if(c == '\\')
        break;
      if(state->delim_open && c == state->delim_open)
        state->delim_count++;
      else if(c == state->delim_close) {
        if(state->delim_count)
          state->delim_count--;
        else
          break;
      }
      else if(is_qq && (c == '$' || c == '@'))
        break;

      valid = true;
      ADVANCE_C;
    }

    if(valid) {
      if(is_qq)
        TOKEN(TOKEN_QQ_STRING_CONTENT);
      else
        TOKEN(TOKEN_Q_STRING_CONTENT);
    }
  }

  if(valid_symbols[TOKEN_QW_LIST_CONTENT]) {
    bool valid = false;
    if(begins_backslash) {
      valid = true;
      goto qwlist_started_backslash;
    }

    while(c) {
      if(iswspace(c))
        break;

      if(c == '\\') {
        /* Most escapes don't count inside a qw() list, but escaped delimiters
         * still do. That is to say, a '\n' is taken as literal, but '\('
         * counts as just '('. We need to handle this carefully
         */
        lexer->mark_end(lexer);
        ADVANCE_C;
qwlist_started_backslash:
        if(c == state->delim_open || c == state->delim_close) {
          ADVANCE_C;
          lexer->mark_end(lexer);
          TOKEN(TOKEN_QW_LIST_CONTENT);
        }
        else if(c == '\\')
          break;
      }
      else if(state->delim_open && c == state->delim_open)
        state->delim_count++;
      else if(c == state->delim_close) {
        if(state->delim_count)
          state->delim_count--;
        else
          break;
      }

      ADVANCE_C;
      lexer->mark_end(lexer);
      valid = true;
    }

    if(valid)
      TOKEN(TOKEN_QW_LIST_CONTENT);
  }

  if(valid_symbols[TOKEN_QUOTELIKE_END]) {
    if(c == state->delim_close && !state->delim_count) {
      ADVANCE_C;

      TOKEN(TOKEN_QUOTELIKE_END);
    }
  }

  if(valid_symbols[TOKEN_PROTOTYPE_OR_SIGNATURE] && c == '(') {
    /* Distinguishing prototypes from signatures is impossible without a way
     * to track what `use VERSION` or `use feature ...` is in scope at this
     * point in the file. The best we can do without that is to claim this is
     * just one of either, while accepting that it will not perfectly parse
     * all possible code. It counts parens so it is likely to get most code
     * about right, but it will get confused with a signature like
     *
     *    ($open = "(")
     *
     * and there's basically nothing we can do about that here.
     */
    DEBUG("prototype or signature\n", 0);

    ADVANCE_C;

    int count = 0;

    while(!lexer->eof(lexer)) {
      if(c == ')' && !count) {
        ADVANCE_C;
        break;
      }
      else if(c == ')')
        count--;
      else if(c == '(')
        count++;

      ADVANCE_C;
    }

    TOKEN(TOKEN_PROTOTYPE_OR_SIGNATURE);
  }

  // we put this late b/c we can't give back what it reads
  if(valid_symbols[TOKEN_HEREDOC_MIDDLE]) {
    while (!lexer->eof(lexer)) {
      // interpolating heredocs may need to stop in the middle of the line, so we do this
      // here
      bool is_valid_start_pos = lexer->get_column(lexer) == 0;
      if(is_valid_start_pos && state->heredoc_indents) {
        skip_whitespace(lexer);
      }

    // TODO - actually work; we needa loop thru and read a line at a time, then check the
    // validity of the next line, and otherwise gobble it
    lexer->mark_end(lexer);
    if(is_valid_start_pos) {
      int checker[HEREDOC_TOKEN_LEN + 1];
      for(int i = 0; i < state->heredoc_delim_length; i++) {
        // TODO - handle dis betta; break @ \n|\r, allow scanning further..
        checker[i] = c;
        checker[i + 1] = 0;
        ADVANCE_C;
        if (lexer->eof(lexer))
          break;
      }
      if (streq(checker, state->heredoc_delim)) {
        // return up to the token, b/c we marked end b4 this line
        TOKEN(TOKEN_HEREDOC_MIDDLE);
      }
    }
    while(c != '\n' && c != '\r' && !lexer->eof(lexer)) {
      ADVANCE_C;
    }
    lexer->mark_end(lexer);
    TOKEN(TOKEN_HEREDOC_MIDDLE);
  }

  if(is_continue_op) {
    /* we're going all in on the evil: these are zero-width tokens w/ unbounded lookahead */
    DEBUG("Starting zero-width lookahead for continue token\n", 0);
    lexer->mark_end(lexer);
    int c1 = c;
    /* let's get the next lookahead */
    ADVANCE_C;
    int c2 = c;
#define EQ2(s)  (c1 == s[0] && c2 == s[1])

    if(valid_symbols[TOKEN_CHEQOP_CONT]) {
      if(EQ2("==") || EQ2("!=") || EQ2("eq") || EQ2("ne"))
        TOKEN(TOKEN_CHEQOP_CONT);
    }

    if(valid_symbols[TOKEN_CHRELOP_CONT]) {
      if(EQ2("lt") || EQ2("le") || EQ2("ge") || EQ2("gt"))
        TOKEN(TOKEN_CHRELOP_CONT);

      if(EQ2(">=") || EQ2("<=")) {
        ADVANCE_C;
        /* exclude <=>, >=>, <=< and other friends */
        if(c == '<' || c == '>')
          return false;

        TOKEN(TOKEN_CHRELOP_CONT);
      }

      if(c1 == '>' || c1 == '<') {
        /* exclude <<, >> and other friends */
        if(c2 == '<' || c2 == '>')
          return false;
        TOKEN(TOKEN_CHRELOP_CONT);
      }
    }
  }

  return false;
}
