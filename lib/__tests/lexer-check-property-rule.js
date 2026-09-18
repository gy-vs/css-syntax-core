import assert from 'assert';
import { parse, lexer } from 'css-tree';

function parsePropertyRule(css) {
    const ast = parse(css, { positions: true });
    return ast.children.first;
}

describe('Lexer#checkPropertyRule()', () => {
    it('should pass a valid rule', () => {
        assert.strictEqual(
            lexer.checkPropertyRule(parsePropertyRule(
                '@property --my-var { syntax: "<length>"; inherits: false; initial-value: 0px; }'
            )),
            null
        );
    });

    it('should pass a valid universal rule without initial value', () => {
        assert.strictEqual(
            lexer.checkPropertyRule(parsePropertyRule(
                '@property --my-var { syntax: "*"; inherits: false; }'
            )),
            null
        );
    });

    it('should pass a universal rule with an initial value', () => {
        assert.strictEqual(
            lexer.checkPropertyRule(parsePropertyRule(
                '@property --my-var { syntax: "*"; inherits: true; initial-value: anything; }'
            )),
            null
        );
    });

    describe('required descriptors', () => {
        it('should fail when syntax descriptor is missing', () => {
            const error = lexer.checkPropertyRule(parsePropertyRule(
                '@property --my-var { inherits: false; initial-value: 0px; }'
            ));

            assert.strictEqual(error.descriptor, 'syntax');
            assert(/syntax/.test(error.message));
            assert.strictEqual(error.node.type, 'Atrule');
        });

        it('should fail when inherits descriptor is missing', () => {
            const error = lexer.checkPropertyRule(parsePropertyRule(
                '@property --my-var { syntax: "<length>"; initial-value: 0px; }'
            ));

            assert.strictEqual(error.descriptor, 'inherits');
            assert(/inherits/.test(error.message));
        });

        it('should fail when initial-value is missing for a non-universal syntax', () => {
            const error = lexer.checkPropertyRule(parsePropertyRule(
                '@property --my-var { syntax: "<length>"; inherits: false; }'
            ));

            assert.strictEqual(error.descriptor, 'initial-value');
            assert(/initial-value/.test(error.message));
        });
    });

    describe('syntax descriptor', () => {
        it('should fail on invalid syntax string', () => {
            const error = lexer.checkPropertyRule(parsePropertyRule(
                '@property --my-var { syntax: "<bogus>"; inherits: false; }'
            ));

            assert.strictEqual(error.descriptor, 'syntax');
            assert(/Unknown syntax type `bogus`/.test(error.message));
            assert.strictEqual(error.node.property, 'syntax');
        });

        it('should fail on stacked multipliers in syntax string', () => {
            const error = lexer.checkPropertyRule(parsePropertyRule(
                '@property --my-var { syntax: "<length>+#"; inherits: false; }'
            ));

            assert.strictEqual(error.descriptor, 'syntax');
        });

        it('should fail when syntax is not a single string', () => {
            const error = lexer.checkPropertyRule(parsePropertyRule(
                '@property --my-var { syntax: <length>; inherits: false; }'
            ));

            assert.strictEqual(error.descriptor, 'syntax');
        });
    });

    describe('inherits descriptor', () => {
        for (const value of ['yes', 'no', '0', 'TRUE FALSE']) {
            it('should fail on `' + value + '`', () => {
                const error = lexer.checkPropertyRule(parsePropertyRule(
                    '@property --my-var { syntax: "*"; inherits: ' + value + '; }'
                ));

                assert.strictEqual(error.descriptor, 'inherits');
                assert(/true.*false/.test(error.message));
            });
        }

        for (const value of ['true', 'false']) {
            it('should pass on `' + value + '`', () => {
                assert.strictEqual(
                    lexer.checkPropertyRule(parsePropertyRule(
                        '@property --my-var { syntax: "*"; inherits: ' + value + '; }'
                    )),
                    null
                );
            });
        }
    });

    describe('initial-value descriptor', () => {
        it('should fail when value doesn\'t match syntax', () => {
            const error = lexer.checkPropertyRule(parsePropertyRule(
                '@property --my-var { syntax: "<length>"; inherits: false; initial-value: red; }'
            ));

            assert.strictEqual(error.descriptor, 'initial-value');
            assert.strictEqual(error.node.property, 'initial-value');
            assert(/doesn't match syntax/.test(error.message));
        });

        it('should fail on a wrong branch of a multi-branch syntax', () => {
            const error = lexer.checkPropertyRule(parsePropertyRule(
                '@property --my-var { syntax: "auto | none"; inherits: false; initial-value: foo; }'
            ));

            assert.strictEqual(error.descriptor, 'initial-value');
        });

        it('should pass on a matching branch', () => {
            assert.strictEqual(
                lexer.checkPropertyRule(parsePropertyRule(
                    '@property --my-var { syntax: "<length> | <color>"; inherits: false; initial-value: red; }'
                )),
                null
            );
        });

        it('should validate list syntaxes (#)', () => {
            assert.strictEqual(
                lexer.checkPropertyRule(parsePropertyRule(
                    '@property --my-var { syntax: "<color>#"; inherits: false; initial-value: red, blue; }'
                )),
                null
            );

            const error = lexer.checkPropertyRule(parsePropertyRule(
                '@property --my-var { syntax: "<color>#"; inherits: false; initial-value: red blue; }'
            ));

            assert.strictEqual(error.descriptor, 'initial-value');
        });

        it('should validate list syntaxes (+)', () => {
            assert.strictEqual(
                lexer.checkPropertyRule(parsePropertyRule(
                    '@property --my-var { syntax: "<length>+"; inherits: false; initial-value: 1px 2px; }'
                )),
                null
            );
        });

        it('should fail on initial value with var()', () => {
            const error = lexer.checkPropertyRule(parsePropertyRule(
                '@property --my-var { syntax: "<length>"; inherits: false; initial-value: var(--x); }'
            ));

            assert.strictEqual(error.descriptor, 'initial-value');
            assert(/var\(\)/.test(error.message));
        });

        it('should report the mismatch location when parsed with positions', () => {
            const error = lexer.checkPropertyRule(parsePropertyRule(
                '@property --my-var { syntax: "<length>"; inherits: false; initial-value: red; }'
            ));

            assert(error.node.loc);
            assert.strictEqual(typeof error.node.loc.start.line, 'number');
        });
    });

    describe('rule structure', () => {
        it('should fail on a non-@property node', () => {
            const rule = parse('.foo {}', { positions: true }).children.first;
            const error = lexer.checkPropertyRule(rule);

            assert(error);
            assert(/@property/.test(error.message));
        });

        it('should fail on prelude that is not a custom property name', () => {
            const error = lexer.checkPropertyRule(parsePropertyRule(
                '@property foo { syntax: "*"; inherits: false; }'
            ));

            assert(/custom property name/.test(error.message));
        });

        it('should fail on an unknown descriptor', () => {
            const error = lexer.checkPropertyRule(parsePropertyRule(
                '@property --my-var { syntax: "*"; inherits: false; foo: bar; }'
            ));

            assert.strictEqual(error.descriptor, 'foo');
            assert(/Unknown @property descriptor/.test(error.message));
        });

        it('should fail on a duplicate descriptor', () => {
            const error = lexer.checkPropertyRule(parsePropertyRule(
                '@property --my-var { syntax: "*"; syntax: "<length>"; inherits: false; }'
            ));

            assert.strictEqual(error.descriptor, 'syntax');
            assert(/Duplicate/.test(error.message));
        });
    });
});
