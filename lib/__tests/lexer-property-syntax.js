import assert from 'assert';
import { lexer, definitionSyntax } from 'css-tree';
import { parsePropertySyntax } from 'css-tree/lexer';

describe('parsePropertySyntax()', () => {
    describe('universal syntax definition', () => {
        it('a single asterisk', () => {
            assert.strictEqual(parsePropertySyntax('*'), null);
        });

        it('a single asterisk with whitespaces around', () => {
            assert.strictEqual(parsePropertySyntax('  *\n'), null);
        });

        it('should fail when an asterisk is combined with other components', () => {
            assert.throws(() => parsePropertySyntax('* | <length>'), /Unexpected input after `\*`/);
            assert.throws(() => parsePropertySyntax('*+'), /Unexpected input after `\*`/);
        });
    });

    describe('data type components', () => {
        it('should parse a single data type', () => {
            assert.deepStrictEqual(parsePropertySyntax('<length>'), {
                type: 'Group',
                terms: [{
                    type: 'Type',
                    name: 'length',
                    opts: null
                }],
                combinator: ' ',
                disallowEmpty: false,
                explicit: false
            });
        });

        it('data type names are case insensitive', () => {
            assert.deepStrictEqual(
                parsePropertySyntax('<LENGTH>'),
                parsePropertySyntax('<length>')
            );
        });

        it('should fail on an unknown data type name', () => {
            assert.throws(
                () => parsePropertySyntax('<lenght>'),
                /Unknown data type `<lenght>`/
            );
        });

        it('should fail on an unclosed data type name', () => {
            assert.throws(() => parsePropertySyntax('<length'), /Expect `>`/);
            assert.throws(() => parsePropertySyntax('<'), /Expect an identifier/);
        });

        it('should fail on whitespaces inside angle brackets', () => {
            assert.throws(() => parsePropertySyntax('< length>'), /Expect an identifier/);
            assert.throws(() => parsePropertySyntax('<length >'), /Expect `>`/);
        });
    });

    describe('supported data type names', () => {
        const dataTypes = [
            'length',
            'number',
            'percentage',
            'length-percentage',
            'color',
            'image',
            'url',
            'integer',
            'angle',
            'time',
            'resolution',
            'transform-function',
            'transform-list',
            'custom-ident',
            'string'
        ];

        for (const name of dataTypes) {
            it(`<${name}>`, () => {
                assert.deepStrictEqual(parsePropertySyntax(`<${name}>`), {
                    type: 'Group',
                    terms: [{
                        type: 'Type',
                        name,
                        opts: null
                    }],
                    combinator: ' ',
                    disallowEmpty: false,
                    explicit: false
                });
            });
        }
    });

    describe('literal components', () => {
        it('should parse a literal ident', () => {
            assert.deepStrictEqual(parsePropertySyntax('auto'), {
                type: 'Group',
                terms: [{
                    type: 'Keyword',
                    name: 'auto'
                }],
                combinator: ' ',
                disallowEmpty: false,
                explicit: false
            });
        });

        it('should fail on a non-ident literal', () => {
            assert.throws(() => parsePropertySyntax('0'), /Expect an identifier/);
            assert.throws(() => parsePropertySyntax('10px'), /Expect an identifier/);
        });
    });

    describe('combinations', () => {
        it('should parse a sequence of components', () => {
            assert.deepStrictEqual(
                parsePropertySyntax('<length> <percentage>'),
                definitionSyntax.parse('<length> <percentage>')
            );
        });

        it('should parse alternatives', () => {
            assert.deepStrictEqual(
                parsePropertySyntax('<length> | <color>'),
                definitionSyntax.parse('<length> | <color>')
            );
        });

        it('should parse alternatives of sequences', () => {
            assert.deepStrictEqual(
                parsePropertySyntax('<length> <color> | red <image> | auto'),
                definitionSyntax.parse('<length> <color> | red <image> | auto')
            );
        });

        it('should allow no whitespaces around a combinator', () => {
            assert.deepStrictEqual(
                parsePropertySyntax('<length>|<color>'),
                definitionSyntax.parse('<length> | <color>')
            );
        });

        it('should fail on an empty alternative', () => {
            assert.throws(() => parsePropertySyntax('<length> |'), /Expect a syntax component/);
            assert.throws(() => parsePropertySyntax('| <length>'), /Expect an identifier/);
            assert.throws(() => parsePropertySyntax('<length> | | <color>'), /Expect an identifier/);
        });

        it('should fail on an empty source', () => {
            assert.throws(() => parsePropertySyntax(''), /Expect a syntax component/);
            assert.throws(() => parsePropertySyntax('  '), /Expect a syntax component/);
        });
    });

    describe('multipliers', () => {
        it('a plus multiplier', () => {
            assert.deepStrictEqual(
                parsePropertySyntax('<length>+'),
                definitionSyntax.parse('<length>+')
            );
        });

        it('a hash multiplier', () => {
            assert.deepStrictEqual(
                parsePropertySyntax('<length>#'),
                definitionSyntax.parse('<length>#')
            );
        });

        it('a multiplier on a literal', () => {
            assert.deepStrictEqual(
                parsePropertySyntax('auto#'),
                definitionSyntax.parse('auto#')
            );
        });

        it('should fail on a combination of multipliers', () => {
            assert.throws(() => parsePropertySyntax('<length>+#'), /Unexpected multiplier/);
            assert.throws(() => parsePropertySyntax('<length>++'), /Unexpected multiplier/);
            assert.throws(() => parsePropertySyntax('<length>##'), /Unexpected multiplier/);
        });

        it('should fail on a multiplier in a wrong place', () => {
            assert.throws(() => parsePropertySyntax('+'), /Expect an identifier/);
            assert.throws(() => parsePropertySyntax('#'), /Expect an identifier/);
            assert.throws(() => parsePropertySyntax('+ <length>'), /Expect an identifier/);
            assert.throws(() => parsePropertySyntax('<length> +'), /Unexpected input/);
            assert.throws(() => parsePropertySyntax('<length> #'), /Unexpected input/);
        });
    });

    describe('matching', () => {
        const syntax = parsePropertySyntax('<length>+ | red <color>#');

        it('should produce an AST suitable for Lexer#match()', () => {
            assert(lexer.match(syntax, '1px').matched);
            assert(lexer.match(syntax, '1px 2em').matched);
            assert(lexer.match(syntax, 'red #ff0000').matched);
            assert(lexer.match(syntax, 'red #ff0000, rgb(1, 2, 3)').matched);
        });

        it('should not match non-matching values', () => {
            assert.strictEqual(lexer.match(syntax, '1px, 2px').matched, null);
            assert.strictEqual(lexer.match(syntax, 'red').matched, null);
            assert.strictEqual(lexer.match(syntax, 'blue 1px').matched, null);
        });
    });
});
