#include <tree_sitter/parser.h>

/* Set this to #define instead to enable debug printing */
#undef DEBUGGING

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
  TOKEN_FAT_COMMA_ZW,
  TOKEN_BRACE_END_ZW,
  /* zero-width high priority token */
  TOKEN_NONASSOC,
  /* regexp related items */
  TOKEN_REGEX_MATCH,
  /* error condition is always last */
  TOKEN_ERROR
};

#define MAX_TSPSTRING_LEN 8
/* this is a arbitrary string where we only care about the first MAX_TSPSTRING_LEN chars */
struct TSPString {
  int length;
  int contents[MAX_TSPSTRING_LEN];
};

/* we record the length, b/c that's still relevant for our cheapo comparison */
static void tspstring_push(struct TSPString *s, int c)
{
  if (s->length++ < MAX_TSPSTRING_LEN)
    s->contents[s->length - 1] = c;
}

static bool tspstring_eq(struct TSPString *s1, struct TSPString *s2)
{
  if(s1->length != s2->length) 
    return false;
  int max_len = s1->length < MAX_TSPSTRING_LEN ? s1->length : MAX_TSPSTRING_LEN;
  for(int i = 0; i < max_len; i++) {
    if (s1->contents[i] != s2->contents[i])
      return false;
  }
  return true;
}

static void tspstring_reset(struct TSPString *s)
{
  s->length = 0;
}

enum HeredocState { HEREDOC_NONE, HEREDOC_START, HEREDOC_UNKNOWN, HEREDOC_CONTINUE, HEREDOC_END };
struct LexerState {
  int delim_open, delim_close;  /* codepoints */
  int delim_count;
  /* heredoc - we need to track if we should start the heredoc, if it's interpolating,
   * how many chars the delimiter is and what the delimiter is */
  bool heredoc_interpolates, heredoc_indents;
  enum HeredocState heredoc_state;
  struct TSPString heredoc_delim;
};

static void lexerstate_add_heredoc(struct LexerState *state, struct TSPString *delim, bool interp, bool indent)
{
  state->heredoc_delim = *delim;
  state->heredoc_interpolates = interp;
  state->heredoc_indents = indent;
  state->heredoc_state = HEREDOC_START;
}

static void lexerstate_finish_heredoc(struct LexerState *state)
{
  state->heredoc_delim.length = 0;
  state->heredoc_state = HEREDOC_NONE;
}


#define ADVANCE_C \
  do {                                         \
    if(lexer->lookahead == '\r') {             \
      DEBUG("> advance U+%04X = \\r\n",        \
          lexer->lookahead);                   \
    } else if(lexer->lookahead == '\n')  {     \
      DEBUG("> advance U+%04X = \\n\n",        \
          lexer->lookahead);                   \
    } else {                                   \
      DEBUG("> advance U+%04X = '%c'\n",       \
          lexer->lookahead, lexer->lookahead); \
    }                                          \
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

static void skip_ws_to_eol(TSLexer * lexer)
{
  while(1) {
    int c = lexer->lookahead;
    if(!c)
      return;
    if(iswspace(c)) {
      lexer->advance(lexer, true);
      // return after eating the newline
      if(c == '\n')
        return;
    }
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
  bool skipped_whitespace = false;

  int c = lexer->lookahead;

  if(!is_ERROR && valid_symbols[TOKEN_GOBBLED_CONTENT]) {
    while (!lexer->eof(lexer)) {
      ADVANCE_C;
    }

    TOKEN(TOKEN_GOBBLED_CONTENT);
  }

  // this is whitespace sensitive, so it must go before any whitespace is skipped
  if(valid_symbols[TOKEN_HEREDOC_MIDDLE] && !is_ERROR) {
    DEBUG("Beginning heredoc contents\n", 0);
    if (state->heredoc_state != HEREDOC_CONTINUE) {
      struct TSPString line;
      // read as many lines as we can 
      while(!lexer->eof(lexer)) {
        tspstring_reset(&line);
        // interpolating heredocs may need to stop in the middle of the line; indented
        // heredocs may START in the beggining of a known line
        bool is_valid_start_pos = state->heredoc_state == HEREDOC_END || lexer->get_column(lexer) == 0;
        bool saw_escape = false;
        DEBUG("Starting loop at col %d\n", lexer->get_column(lexer));
        if(is_valid_start_pos && state->heredoc_indents) {
          DEBUG("Skipping initial whitespace in heredoc\n", 0);
          skip_whitespace(lexer);
          c = lexer->lookahead;
        }
        // we may be doing lookahead now
        lexer->mark_end(lexer);
        // read the whole line, b/c we want it
        while(c != '\n' && !lexer->eof(lexer)) {
          // we need special handling for windows line ending, b/c we can't count it in
          // our lookahead
          if(c == '\r') {
            ADVANCE_C;
            if(c == '\n')
              break;
            tspstring_push(&line, '\r');
          }
          tspstring_push(&line, c);
          if (c == '$' || c == '@' || c == '\\')
            saw_escape = true;
          ADVANCE_C;
        }
        DEBUG("got length %d, want length %d\n", line.length, state->heredoc_delim.length);
        if(is_valid_start_pos && tspstring_eq(&line, &state->heredoc_delim)) {
          // if we've read already, we return everything up until now
          if(state->heredoc_state != HEREDOC_END) {
            state->heredoc_state = HEREDOC_END;
            TOKEN(TOKEN_HEREDOC_MIDDLE);
          }
          lexer->mark_end(lexer);
          lexerstate_finish_heredoc(state);
          TOKEN(TOKEN_HEREDOC_END);
        }
        if(saw_escape && state->heredoc_interpolates) {
          // we'll repeat this line in continue mode where we'll pause midline
          state->heredoc_state = HEREDOC_CONTINUE;
          TOKEN(TOKEN_HEREDOC_MIDDLE);
        }
        // eat the \n and loop again; can't skip whitespace b/c the next line may care
        ADVANCE_C;
      }
    } else {
      DEBUG("Entering heredoc interp mode\n", 0);
      // handle the continue case; read ahead until we get a \n or an escape
      bool saw_chars = false;
      while(1) {
        if(strchr("$@", c)) {
          // string interp is whitespace sensitive, so we need to do an extra lookahead
          lexer->mark_end(lexer);
          ADVANCE_C;
          if(!iswspace(c)) {
            break;
          }
        }
        if(c == '\\') {
          lexer->mark_end(lexer);
          break;
        }
        if(c == '\n') {
          lexer->mark_end(lexer);
          state->heredoc_state = HEREDOC_UNKNOWN;
          TOKEN(TOKEN_HEREDOC_MIDDLE);
        }
        saw_chars = true;
        ADVANCE_C;
      }
      if(saw_chars)
        TOKEN(TOKEN_HEREDOC_MIDDLE);
      }
  }

  skip_ws_to_eol(lexer);
  /* heredocs override everything, so they must be here before */
  if(valid_symbols[TOKEN_HEREDOC_START]) {
    if(!lexer->eof(lexer) && state->heredoc_state == HEREDOC_START && lexer->get_column(lexer) == 0) {
      state->heredoc_state = HEREDOC_UNKNOWN;
      TOKEN(TOKEN_HEREDOC_START);
    }
  }

  if (iswspace(c)) {
    skipped_whitespace = true;
    skip_whitespace(lexer);
    c = lexer->lookahead;
  }

  if(valid_symbols[TOKEN_ATTRIBUTE_VALUE]) {
    /* the '(' must be immediate, before any whitespace */
    if(c == '(' && !skipped_whitespace) {
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

  if(valid_symbols[PERLY_SEMICOLON]) {
    if(c == ';') {
      ADVANCE_C;

      TOKEN(PERLY_SEMICOLON);
    }
    if(c == '}' || lexer->eof(lexer)) {
      // do a PERLY_SEMICOLON unless we're in brace autoquoting
      if(is_ERROR || !valid_symbols[TOKEN_BRACE_END_ZW]) {
        DEBUG("Fake PERLY_SEMICOLON at end-of-scope\n", 0);
        // no advance
        TOKEN(PERLY_SEMICOLON);
      }
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

  // This could be the wrong spot to check this, but it hasn't changed
  // anything in the test suite, so I think it's safe for now.
  //
  // A potential improvement would be to separate create separate match groups like:
  // $string =~ s/foo/bar/g
  //            ^ regex start
  //             ^ operator
  //              ^^^ regex pattern
  //                 ^ operator
  //                  ^^^ regex pattern
  //                     ^ operator
  //                      ^ regex modifier
  //
  // But for now, we'll leave that for another day (and perhaps upstream will do that
  // at some point anyway in a more robust perl fashion).
  if (valid_symbols[TOKEN_REGEX_MATCH]) {
    // Next character *must* be a '/', otherwise it won't be valid.
    if (lexer->lookahead == '/') {
      ADVANCE_C;

      while (lexer->lookahead != '/' && lexer->lookahead != '\n' && !lexer->eof(lexer)) {
        if (lexer->lookahead == '\\') {
          ADVANCE_C;
        }
        ADVANCE_C;
      }

      if (lexer->lookahead == '/') {
        ADVANCE_C;
        while (lexer->lookahead != '/' && lexer->lookahead != '\n' && !lexer->eof(lexer)) {
          if (lexer->lookahead == '\\') {
            ADVANCE_C;
          }
          ADVANCE_C;
        }

        if (lexer->lookahead == '/') {
          ADVANCE_C;

          TOKEN(TOKEN_REGEX_MATCH);
        }
      }

      return false;
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

  if(valid_symbols[TOKEN_POD] && !lexer->eof(lexer)) {
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

  /* we use this to force tree-sitter to stay on the error branch of a nonassoc operator */
  if(valid_symbols[TOKEN_NONASSOC])
    TOKEN(TOKEN_NONASSOC);

  if(valid_symbols[TOKEN_HEREDOC_DELIM] || valid_symbols[TOKEN_COMMAND_HEREDOC_DELIM]) {
    // by default, indentation is false and interpolation is true
    bool should_indent = false;
    bool should_interpolate = true;

    struct TSPString delim;
    tspstring_reset(&delim);
    if(!skipped_whitespace) {
      if(c == '~') {
        ADVANCE_C;
        should_indent = true;
      } 
      if(c == '\\') {
        ADVANCE_C;
        should_interpolate = false;
      }
      if(isidfirst(c)) {
        while(isidcont(c)) {
          tspstring_push(&delim, c);
          ADVANCE_C;
        }
        lexerstate_add_heredoc(state, &delim, should_interpolate, should_indent);
        TOKEN(TOKEN_HEREDOC_DELIM);
      }
    }
    // if we picked up a ~ before, we may have to skip to hit the quote
    if(should_indent) {
      skip_whitespace(lexer);
      c = lexer->lookahead;
    }
    // if we picked up a \ before, we cannot allow even an immediate quote
    if(should_interpolate && (c == '\'' || c == '"' || c == '`')) {
      int delim_open = c;
      should_interpolate = c != '\'';
      ADVANCE_C;
      while (c != delim_open && !lexer->eof(lexer)) {
        // backslashes escape the quote char and nothing else, not even a backslash
        if(c == '\\') {
          int to_add = c;
          ADVANCE_C;
          if(c == delim_open) {
            to_add = delim_open;
            ADVANCE_C;
          }
          tspstring_push(&delim, to_add);
        } else {
          tspstring_push(&delim, c);
          ADVANCE_C;
        }
      }
      if(delim.length > 0) {
        // gotta eat that delimiter
        ADVANCE_C;
        // gotta null terminate up in here
        lexerstate_add_heredoc(state, &delim, should_interpolate, should_indent);
        if(delim_open == '`')
          TOKEN(TOKEN_COMMAND_HEREDOC_DELIM);
        TOKEN(TOKEN_HEREDOC_DELIM);
      }
    }
  }

  if(valid_symbols[TOKEN_QUOTELIKE_BEGIN]) {
    int delim = c;
    if (skipped_whitespace && c == '#')
      return false;
    // we must do a two char lookahead to avoid turning the "=" in => into a quote char
    lexer->mark_end(lexer);
    ADVANCE_C;
    // we return a fat_comma zw in the event that we see it, b/c that has higher
    // precedence than the quoting op
    if (delim == '=' && c == '>')
      TOKEN(TOKEN_FAT_COMMA_ZW);

    if(valid_symbols[TOKEN_BRACE_END_ZW] && delim == '}') {
      DEBUG("wag1\n", 0);
      TOKEN(TOKEN_BRACE_END_ZW);
    }
    lexer->mark_end(lexer);

    int delim_close = close_for_open(delim);
    if(delim_close) {
      state->delim_open  = delim;
      state->delim_close = delim_close;
    }
    else {
      state->delim_open  = 0;
      state->delim_close = delim;
    }
    state->delim_count = 0;


    DEBUG("Generic QSTRING open='%c' close='%c'\n", state->delim_open, state->delim_close);
    TOKEN(TOKEN_QUOTELIKE_BEGIN);
  }

  if(c == '\\') {
    // eat the reverse-solidus
    ADVANCE_C;
    // let's see what that reverse-solidus was hiding!
    // note that we may have fallen through here from a HEREDOC_MIDDLE, so we need to
    // accept the token explicitly after we've read our heart's content
    int esc_c = c;
    // if we escaped a whitespace, the space comes through, it just hides the \ char
    if(!iswspace(c))
      ADVANCE_C;

    if(valid_symbols[TOKEN_ESCAPED_DELIMITER]) {
      if(esc_c == state->delim_open || esc_c == state->delim_close) {
        lexer->mark_end(lexer);
        TOKEN(TOKEN_ESCAPED_DELIMITER);
      }
    }

    if(valid_symbols[TOKEN_ESCAPE_SEQUENCE]) {
      // Inside any kind of string, \\ is always an escape sequence
      lexer->mark_end(lexer);
      if(esc_c == '\\')
        TOKEN(TOKEN_ESCAPE_SEQUENCE);

      if(valid_symbols[TOKEN_Q_STRING_CONTENT]) {
        // Inside a q() string, only \\ is a valid escape sequence; all else is literal
        TOKEN(TOKEN_Q_STRING_CONTENT);
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

  bool is_continue_op = valid_symbols[TOKEN_CHEQOP_CONT] || valid_symbols[TOKEN_CHRELOP_CONT] || valid_symbols[TOKEN_FAT_COMMA_ZW] || valid_symbols[TOKEN_BRACE_END_ZW];
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

    if(valid_symbols[TOKEN_FAT_COMMA_ZW]) {
      if(EQ2("=>"))
        TOKEN(TOKEN_FAT_COMMA_ZW);
    }
    if(valid_symbols[TOKEN_BRACE_END_ZW]){
      if(c1 == '}')
        TOKEN(TOKEN_BRACE_END_ZW);
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
