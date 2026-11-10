from db.fuzzy import fuzzy_term_in_text

CS = "int strgLen( char *s ) returns the number of characters."
BIO = "Mitochondria produce ATP through oxidative phosphorylation."
HIST = "The Treaty of Versailles was signed in 1919."


def test_typos_prefixes_and_abbreviations_match():
    assert fuzzy_term_in_text("stglen", CS)
    assert fuzzy_term_in_text("strleng", CS)
    assert fuzzy_term_in_text("str", CS)
    assert fuzzy_term_in_text("mitochondira", BIO)
    assert fuzzy_term_in_text("phosph", BIO)
    assert fuzzy_term_in_text("versaile", HIST)


def test_unrelated_short_and_numeric_terms_do_not_match():
    assert not fuzzy_term_in_text("pointer", CS)
    assert not fuzzy_term_in_text("zebra", BIO)
    assert not fuzzy_term_in_text("1919x", HIST)
    assert not fuzzy_term_in_text("12", HIST)
