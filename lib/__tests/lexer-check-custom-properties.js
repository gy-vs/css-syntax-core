import assert from 'assert';
import { parse, lexer, propertySyntax } from 'css-tree';

function check(css) {
    return lexer.checkCustomProperties(parse(css, { positions: true }));
}

function errorMessages(css) {
    return check(css).map(error => error.message);
}

describe('Lexer#checkCustomProperties()', () => {
    it('should return no errors on an empty stylesheet', () => {
        assert.deepStrictEqual(check(''), []);
        assert.deepStrictEqual(check('.foo { color: red; }'), []);
    });

    it('should report errors for invalid @property rules', () => {
        const errors = check('@property --x { syntax: "<length>"; }');

        assert.strictEqual(errors.length, 1);
        assert.strictEqual(errors[0].descriptor, 'inherits');
    });

    describe('registered property declarations', () => {
        it('should pass values matching registered syntax', () => {
            assert.deepStrictEqual(errorMessages(
                '@property --x { syntax: "<length>"; inherits: false; initial-value: 0px; }' +
                '.a { --x: 10px; }'
            ), []);
        });

        it('should report a value not matching registered syntax', () => {
            const errors = check(
                '@property --x { syntax: "<length>"; inherits: false; initial-value: 0px; }' +
                '.a { --x: red; }'
            );

            assert.strictEqual(errors.length, 1);
            assert(/--x/.test(errors[0].message));
            assert(/registered syntax/.test(errors[0].message));
            assert.strictEqual(errors[0].node.type, 'Declaration');
            assert.strictEqual(errors[0].node.property, '--x');
        });

        it('should check against the correct registered property', () => {
            const errors = check(
                '@property --a { syntax: "<length>"; inherits: false; initial-value: 0px; }' +
                '@property --b { syntax: "<color>"; inherits: false; initial-value: red; }' +
                '.a { --a: 1px; --b: red; }' +
                '.b { --a: red; --b: 1px; }'
            );

            assert.strictEqual(errors.length, 2);
            assert(/--a/.test(errors[0].message));
            assert(/--b/.test(errors[1].message));
        });

        it('should validate list syntaxes', () => {
            assert.deepStrictEqual(errorMessages(
                '@property --x { syntax: "<length>+"; inherits: false; initial-value: 1px; }' +
                '.a { --x: 1px 2px 3px; }'
            ), []);

            assert.deepStrictEqual(errorMessages(
                '@property --x { syntax: "<length>#"; inherits: false; initial-value: 1px; }' +
                '.a { --x: 1px, 2px, 3px; }'
            ), []);

            assert.strictEqual(errorMessages(
                '@property --x { syntax: "<length>#"; inherits: false; initial-value: 1px; }' +
                '.a { --x: 1px 2px; }'
            ).length, 1);
        });

        it('should ignore unregistered custom properties', () => {
            assert.deepStrictEqual(errorMessages('.a { --unknown: whatever; }'), []);
        });

        it('should ignore declarations of regular properties', () => {
            assert.deepStrictEqual(errorMessages(
                '@property --x { syntax: "<length>"; inherits: false; initial-value: 0px; }' +
                '.a { color: red; margin: 10px; }'
            ), []);
        });

        it('should check declarations in nested at-rules', () => {
            const errors = check(
                '@property --x { syntax: "<length>"; inherits: false; initial-value: 0px; }' +
                '@media screen { .a { --x: red; } }'
            );

            assert.strictEqual(errors.length, 1);
        });
    });

    describe('var()', () => {
        it('should not report a value containing var()', () => {
            assert.deepStrictEqual(errorMessages(
                '@property --x { syntax: "<length>"; inherits: false; initial-value: 0px; }' +
                '.a { --x: var(--y); }'
            ), []);
        });

        it('should not report a value with var() inside a function', () => {
            assert.deepStrictEqual(errorMessages(
                '@property --x { syntax: "<length>"; inherits: false; initial-value: 0px; }' +
                '.a { --x: calc(var(--y, 1px)); }'
            ), []);
        });

        it('should still report a definite mismatch without var()', () => {
            assert.strictEqual(errorMessages(
                '@property --x { syntax: "<length>"; inherits: false; initial-value: 0px; }' +
                '.a { --x: red; }'
            ).length, 1);
        });
    });

    describe('css-wide keywords', () => {
        for (const keyword of ['initial', 'inherit', 'unset', 'revert', 'revert-layer']) {
            it('should allow `' + keyword + '`', () => {
                assert.deepStrictEqual(errorMessages(
                    '@property --x { syntax: "<length>"; inherits: false; initial-value: 0px; }' +
                    '.a { --x: ' + keyword + '; }'
                ), []);
            });
        }

        it('should not treat a css-wide keyword followed by other tokens as valid', () => {
            assert.strictEqual(errorMessages(
                '@property --x { syntax: "<length>"; inherits: false; initial-value: 0px; }' +
                '.a { --x: initial red; }'
            ).length, 1);
        });
    });

    describe('universal syntax', () => {
        it('should accept any value when syntax is *', () => {
            assert.deepStrictEqual(errorMessages(
                '@property --x { syntax: "*"; inherits: false; }' +
                '.a { --x: anything at all 42%; }'
            ), []);
        });
    });

    it('should not register invalid @property rules', () => {
        assert.deepStrictEqual(errorMessages(
            '@property --x { syntax: "<bogus>"; inherits: false; }' +
            '.a { --x: red; }'
        ).filter(m => /--x.*registered/.test(m)), []);
    });

    describe('Lexer#matchRegisteredProperty()', () => {
        it('should match a Value node against a registered syntax', () => {
            const syntax = propertySyntax.parse('<length>');

            assert.strictEqual(
                lexer.matchRegisteredProperty(syntax, parse('10px', { context: 'value' })),
                true
            );
            assert.strictEqual(
                lexer.matchRegisteredProperty(syntax, parse('red', { context: 'value' })),
                false
            );
            assert.strictEqual(
                lexer.matchRegisteredProperty(syntax, parse('var(--x)', { context: 'value' })),
                'var'
            );
        });

        it('should match a Raw value of a custom property declaration', () => {
            const syntax = propertySyntax.parse('<length>');
            const declaration = parse('.a { --x: 10px; }', { positions: true })
                .children.first.block.children.first;

            assert.strictEqual(declaration.value.type, 'Raw');
            assert.strictEqual(
                lexer.matchRegisteredProperty(syntax, declaration.value),
                true
            );
        });
    });
});
