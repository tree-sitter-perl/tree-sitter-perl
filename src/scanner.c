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
  /* ident-alikes */
  TOKEN_Q_STRING_BEGIN,
  TOKEN_QQ_STRING_BEGIN,
  TOKEN_QW_LIST_BEGIN,
  /* non-ident tokens */
  PERLY_SEMICOLON,
  PERLY_BRACE_OPEN,
  TOKEN_HASHBRACK,
  /* immediates */
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
};

struct LexerState {
  int delim_open, delim_close;  /* codepoints */
  int delim_count;
};

#define ADVANCE \
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
  while(maxlen)
    if(!lexer->lookahead)
      return;
    else if(strchr(allow, lexer->lookahead)) {
      ADVANCE;
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
  if(lexer->lookahead != '{')
    return;

  ADVANCE;
  while(lexer->lookahead && lexer->lookahead != '}')
    ADVANCE;

  ADVANCE;
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

  // The only time we'd ever be looking for both BEGIN and END is during an error
  // condition. Abort in that case
  if(valid_symbols[TOKEN_Q_STRING_BEGIN] && valid_symbols[TOKEN_QUOTELIKE_END]) {
    DEBUG("Abort on ERROR\n", 0);
    return false;
  }
  
  if(valid_symbols[TOKEN_GOBBLED_CONTENT]) {
    while (!lexer->eof(lexer)) 
      ADVANCE;

    TOKEN(TOKEN_GOBBLED_CONTENT);
  }

  int c = lexer->lookahead;

  if(valid_symbols[TOKEN_ATTRIBUTE_VALUE]) {
    /* the '(' must be immediate, before any whitespace */
    if(c == '(') {
      DEBUG("Attribute value started...\n", 0);

      ADVANCE;
      c = lexer->lookahead;

      int delimcount = 0;
      while(!lexer->eof(lexer)) {
        if(c == '\\') {
          ADVANCE;
          /* ignore the next char */
        }
        else if(c == '(')
          delimcount++;
        else if(c == ')') {
          if(delimcount)
            delimcount--;
          else {
            ADVANCE;
            break;
          }
        }

        ADVANCE;
        c = lexer->lookahead;
      }

      TOKEN(TOKEN_ATTRIBUTE_VALUE);
    }
  }

  bool allow_identalike = false;
  for(int sym = 0; sym <= TOKEN_Q_STRING_BEGIN; sym++)
    if(valid_symbols[sym]) {
      allow_identalike = true;
      break;
    }

  if(allow_identalike || valid_symbols[PERLY_SEMICOLON]);
    skip_whitespace(lexer);

  c = lexer->lookahead;

  if(valid_symbols[PERLY_SEMICOLON]) {
    if(c == ';') {
      ADVANCE;

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
    ADVANCE;

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
    ADVANCE;

    while((c = lexer->lookahead) && isidcont(c)) {
      if(ident_len < MAX_IDENT_LEN) {
        ident[ident_len] = c;
        ident[ident_len+1] = 0;
      }

      ADVANCE;
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
  ) {
    ADVANCE;

    c = lexer->lookahead;
  }

  if(valid_symbols[TOKEN_Q_STRING_BEGIN]) {
    /* Always expecting TOKEN_QQ_STRING_BEGIN as well */
    if(ident_len == 1 && streq(ident, "q") ||
        ident_len == 2 && streq(ident, "qq")) {
      skip_whitespace(lexer);

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

      ADVANCE;

      DEBUG("Generic QSTRING open='%c' close='%c'\n", state->delim_open, state->delim_close);

      if(ident_len == 1)
        TOKEN(TOKEN_Q_STRING_BEGIN);
      else
        TOKEN(TOKEN_QQ_STRING_BEGIN);
    }
    if(lexer->lookahead == '\'') {
      ADVANCE;

      state->delim_open = 0;
      state->delim_close = '\'';
      state->delim_count = 0;

      TOKEN(TOKEN_Q_STRING_BEGIN);
    }
    if(lexer->lookahead == '"') {
      ADVANCE;

      state->delim_open = 0;
      state->delim_close = '"';
      state->delim_count = 0;

      TOKEN(TOKEN_QQ_STRING_BEGIN);
    }
  }
  if(valid_symbols[TOKEN_QW_LIST_BEGIN]) {
    if(ident_len == 2 && streq(ident, "qw")) {
      skip_whitespace(lexer);

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

      ADVANCE;

      DEBUG("QW LIST open='%c' close='%c'\n", state->delim_open, state->delim_close);

      TOKEN(TOKEN_QW_LIST_BEGIN);
    }
  }

  if(valid_symbols[TOKEN_ESCAPED_DELIMITER] && begins_backslash) {
    if(c == state->delim_open || c == state->delim_close) {
      ADVANCE;
      TOKEN(TOKEN_ESCAPED_DELIMITER);
    }
  }

  if(valid_symbols[TOKEN_ESCAPE_SEQUENCE] && begins_backslash) {
    ADVANCE;

    // Inside any kind of string, \\ is always an escape sequence
    if(c == '\\')
      TOKEN(TOKEN_ESCAPE_SEQUENCE);

    if(valid_symbols[TOKEN_Q_STRING_CONTENT]) {
      // Inside a q() string, only \\ is a valid escape sequence; all else is literal
      TOKEN(TOKEN_Q_STRING_CONTENT);
    }
    if(valid_symbols[TOKEN_QW_LIST_CONTENT]) {
      // Inside a qw() list, only \\ is a valid escape sequence; all else is literal
      TOKEN(TOKEN_QW_LIST_CONTENT);
    }

    switch(c) {
      case 'x':
        if(lexer->lookahead == '{')
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

    int c;
    while((c = lexer->lookahead)) {
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
      ADVANCE;
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

    int c;
    while((c = lexer->lookahead)) {
      if(iswspace(c))
        break;

      if(c == '\\') {
        /* Most escapes don't count inside a qw() list, but escaped delimiters
         * still do. That is to say, a '\n' is taken as literal, but '\('
         * counts as just '('. We need to handle this carefully
         */
        lexer->mark_end(lexer);
        ADVANCE;

        c = lexer->lookahead;
qwlist_started_backslash:
        if(c == state->delim_open || c == state->delim_close) {
          ADVANCE;
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

      ADVANCE;
      lexer->mark_end(lexer);
      valid = true;
    }

    if(valid)
      TOKEN(TOKEN_QW_LIST_CONTENT);
  }

  if(valid_symbols[TOKEN_QUOTELIKE_END]) {
    if(c == state->delim_close && !state->delim_count) {
      ADVANCE;

      TOKEN(TOKEN_QUOTELIKE_END);
    }
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

        ADVANCE;
        c = lexer->lookahead;
      }
      if(stage < 6)
        while(!lexer->eof(lexer)) {
          if(c == '\n')
            break;

          ADVANCE;
          c = lexer->lookahead;
        }
      /* If we got this far then either we reached stage 6, or we're at EOF */
      TOKEN(TOKEN_POD);
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

    ADVANCE;
    c = lexer->lookahead;

    int count = 0;

    while(!lexer->eof(lexer)) {
      if(c == ')' && !count) {
        ADVANCE;
        break;
      }
      else if(c == ')')
        count--;
      else if(c == '(')
        count++;

      ADVANCE;
      c = lexer->lookahead;
    }

    TOKEN(TOKEN_PROTOTYPE_OR_SIGNATURE);
  }

  return false;
}
