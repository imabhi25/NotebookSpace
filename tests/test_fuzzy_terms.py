from db.notebook_store import fuzzy_term_in_text


def test_typos_match_camel_case_identifier():
    text = "int strgLen( char *s ) returns the number of characters."
    assert fuzzy_term_in_text("stglen", text)
    assert fuzzy_term_in_text("strleng", text)


def test_unrelated_and_short_terms_do_not_match():
    text = "int strgLen( char *s ) returns the number of characters."
    assert not fuzzy_term_in_text("pointer", text)
    assert not fuzzy_term_in_text("why", text)
    assert not fuzzy_term_in_text("123", text)
