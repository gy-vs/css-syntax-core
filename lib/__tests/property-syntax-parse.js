import assert from 'assert';
import { propertySyntax, definitionSyntax, lexer } from 'css-tree';

const { parse, isUniversalSyntax, supportedSyntaxTypes } = propertySyntax;

describe('propertySyntax.parse()', () => {
    describe('universal syntax', () => {
        it('should parse *', () => {
            const ast = parse('*');

            assert.strictEqual(ast.type, 'Group');
            assert.strictEqual(isUniversalSyntax(ast), true);
        });

        it('should return the universal syntax AST singleton', () => {
            assert.strictEqual(parse('*'), propertySyntax.universalSyntaxAst);
            assert.strictEqual(Object.isFrozen(propertySyntax.universalSyntaxAst), true);
        });

        for (const source of [' * ', '  *\t', '\n*\n']) {
            it('should allow whitespace around `*` (' + JSON.stringify(source) + ')', () => {
                assert.strictEqual(isUniversalSyntax(parse(source)), true);
            });
        }

        it('should not allow extra tokens around `*`', () => {
            for (const source of ['**', '* x', '* | <length>', 'x *']) {
                assert.throws(() => parse(source), /Unexpected input/);
            }
        });

        it('should produce a syntax that matches any non-empty value', () => {
            const ast = parse('*');

            assert(lexer.match(ast, 'red').matched);
            assert(lexer.match(ast, '1px solid red').matched);
            assert(lexer.match(ast, 'linear-gradient(red, blue)').matched);
            assert.strictEqual(lexer.match(ast, '').matched, null);
        });
    });

    describe('types', () => {
        for (const name of supportedSyntaxTypes) {
            it('should support <' + name + '>', () => {
                const ast = parse('<' + name + '>');

                assert.strictEqual(ast.type, 'Group');
                assert.strictEqual(ast.terms.length, 1);
                assert.strictEqual(ast.terms[0].type, 'Type');
                assert.strictEqual(ast.terms[0].name, name);
            });
        }

        it('should fail on an unsupported type name', () => {
            assert.throws(() => parse('<bogus>'), /Unknown syntax type `bogus`/);
            assert.throws(() => parse('<length-percentage-plus>'), /Unknown syntax type/);
        });

        it('should fail on malformed type notation', () => {
            for (const source of ['<>', '<length', 'length>', '<>', '<<length>>']) {
                assert.throws(() => parse(source));
            }
        });

        it('should match values via the lexer', () => {
            assert(lexer.match(parse('<length>'), '10px').matched);
            assert(lexer.match(parse('<color>'), 'red').matched);
            assert(lexer.match(parse('<transform-list>'), 'translateX(1px) rotate(1deg)').matched);
            assert.strictEqual(lexer.match(parse('<length>'), 'red').matched, null);
            assert.strictEqual(lexer.match(parse('<color>'), '10px').matched, null);
        });
    });

    describe('literal identifiers', () => {
        it('should parse a single literal', () => {
            const ast = parse('auto');

            assert.strictEqual(ast.terms.length, 1);
            assert.deepStrictEqual(ast.terms[0], { type: 'Keyword', name: 'auto' });
        });

        it('should match literals exactly', () => {
            const ast = parse('auto | none');

            assert(lexer.match(ast, 'auto').matched);
            assert(lexer.match(ast, 'none').matched);
            assert.strictEqual(lexer.match(ast, 'foo').matched, null);
        });
    });

    describe('branches', () => {
        it('should parse alternatives', () => {
            const ast = parse('<length> | <percentage> | auto');

            assert.strictEqual(ast.combinator, '|');
            assert.strictEqual(ast.terms.length, 3);
            assert.strictEqual(ast.terms[0].type, 'Type');
            assert.strictEqual(ast.terms[1].type, 'Type');
            assert.strictEqual(ast.terms[2].type, 'Keyword');
        });

        it('should allow whitespace around `|`', () => {
            assert.doesNotThrow(() => parse('<length>|<color>'));
            assert.doesNotThrow(() => parse(' <length> | <color> '));
        });

        it('should not allow dangling `|`', () => {
            assert.throws(() => parse('| <length>'));
            assert.throws(() => parse('<length> |'));
            assert.throws(() => parse('<length> || <color>'));
        });
    });

    describe('multipliers', () => {
        it('should parse + as a space-separated list', () => {
            const ast = parse('<length>+');
            const multiplier = ast.terms[0];

            assert.strictEqual(multiplier.type, 'Multiplier');
            assert.strictEqual(multiplier.comma, false);
            assert.strictEqual(multiplier.min, 1);
            assert.strictEqual(multiplier.max, 0);
            assert.strictEqual(multiplier.term.type, 'Type');
            assert.strictEqual(multiplier.term.name, 'length');

            assert(lexer.match(ast, '1px 2px 3px').matched);
            assert.strictEqual(lexer.match(ast, '1px, 2px').matched, null);
        });

        it('should parse # as a comma-separated list', () => {
            const ast = parse('<color>#');
            const multiplier = ast.terms[0];

            assert.strictEqual(multiplier.type, 'Multiplier');
            assert.strictEqual(multiplier.comma, true);

            assert(lexer.match(ast, 'red, blue').matched);
            assert.strictEqual(lexer.match(ast, 'red blue').matched, null);
        });

        it('should allow a multiplier on a literal', () => {
            const ast = parse('foo+');

            assert.strictEqual(ast.terms[0].type, 'Multiplier');
            assert.strictEqual(ast.terms[0].term.type, 'Keyword');
            assert(lexer.match(ast, 'foo foo').matched);
        });

        it('should not allow stacking multipliers', () => {
            for (const source of ['<length>++', '<length>##', '<length>+#', '<length>#+']) {
                assert.throws(() => parse(source), /Unexpected multiplier/);
            }
        });

        it('should not allow a multiplier without a component', () => {
            assert.throws(() => parse('+'));
            assert.throws(() => parse('#'));
        });

        it('should not allow other definition-syntax multipliers', () => {
            assert.throws(() => parse('<length>?'));
            assert.throws(() => parse('<length>*'));
            assert.throws(() => parse('<length>{2}'));
        });
    });

    describe('bad syntax', () => {
        const cases = [
            '',
            '   ',
            '<length> <color>',
            'red blue',
            '<length>;',
            '[ <length> ]',
            '<length>!',
            '(<length>)',
            '*| <length>',
            '<length> |*',
            '< length >',
            'red, blue'
        ];

        for (const source of cases) {
            it(JSON.stringify(source) + ' should throw', () => {
                assert.throws(() => parse(source));
            });
        }

        it('should throw a SyntaxError with source and offset', () => {
            try {
                parse('<bogus>');
                assert.fail('should throw');
            } catch (e) {
                assert.strictEqual(e.name, 'SyntaxError');
                assert.strictEqual(e.input, '<bogus>');
                assert.strictEqual(typeof e.offset, 'number');
            }
        });
    });

    describe('AST compatibility', () => {
        it('should produce AST nodes traversable by definitionSyntax walk', () => {
            const types = [];

            definitionSyntax.walk(parse('<length>+ | <color>#'), node => types.push(node.type));

            assert(types.includes('Type'));
            assert(types.includes('Multiplier'));
        });

        it('should produce AST nodes serializable by definitionSyntax generate', () => {
            assert.strictEqual(definitionSyntax.generate(parse('<length>+ | <color>#')), '<length>+ | <color>#');
            assert.strictEqual(definitionSyntax.generate(parse('auto | none')), 'auto | none');
        });
    });
});
