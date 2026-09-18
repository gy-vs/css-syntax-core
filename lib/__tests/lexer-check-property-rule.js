import assert from 'assert';
import { parse, lexer } from 'css-tree';

function checkPropertyRule(css) {
    return lexer.checkPropertyRule(parse(css).children.first);
}

describe('Lexer#checkPropertyRule()', () => {
    it('should fail on a non @property node', () => {
        const error = lexer.checkPropertyRule(parse('@media screen {}').children.first);

        assert.strictEqual(error.name, 'SyntaxError');
        assert.strictEqual(error.message, 'Not a @property rule');
    });

    it('should pass on a valid rule', () => {
        const error = checkPropertyRule('@property --x { syntax: "<length>"; inherits: false; initial-value: 0px; }');

        assert.strictEqual(error, undefined);
    });

    it('should pass on a valid rule with the universal syntax and no initial-value', () => {
        const error = checkPropertyRule('@property --x { syntax: "*"; inherits: true; }');

        assert.strictEqual(error, undefined);
    });

    it('should pass on a valid rule with the universal syntax and an initial-value', () => {
        const error = checkPropertyRule('@property --x { syntax: "*"; inherits: true; initial-value: 0; }');

        assert.strictEqual(error, undefined);
    });

    it('descriptor names are case insensitive', () => {
        const error = checkPropertyRule('@property --x { SYNTAX: "<length>"; Inherits: FALSE; INITIAL-VALUE: 0px; }');

        assert.strictEqual(error, undefined);
    });

    it('should pass when initial-value contains var() since it can\'t be verified', () => {
        const error = checkPropertyRule('@property --x { syntax: "<length>"; inherits: false; initial-value: var(--y, 1px); }');

        assert.strictEqual(error, undefined);
    });

    describe('missing descriptors', () => {
        it('missing syntax', () => {
            const error = checkPropertyRule('@property --x { inherits: false; initial-value: 0px; }');

            assert.strictEqual(error.descriptor, 'syntax');
            assert.strictEqual(error.message, 'Missing required `syntax` descriptor in @property rule');
        });

        it('missing inherits', () => {
            const error = checkPropertyRule('@property --x { syntax: "<length>"; initial-value: 0px; }');

            assert.strictEqual(error.descriptor, 'inherits');
            assert.strictEqual(error.message, 'Missing required `inherits` descriptor in @property rule');
        });

        it('missing initial-value', () => {
            const error = checkPropertyRule('@property --x { syntax: "<length>"; inherits: false; }');

            assert.strictEqual(error.descriptor, 'initial-value');
            assert.strictEqual(error.message, 'Missing required `initial-value` descriptor in @property rule');
        });

        it('no block at all', () => {
            const error = checkPropertyRule('@property --x;');

            assert.strictEqual(error.descriptor, 'syntax');
        });
    });

    describe('syntax descriptor', () => {
        it('should fail when the value is not a string', () => {
            const error = checkPropertyRule('@property --x { syntax: <length>; inherits: false; initial-value: 0px; }');

            assert.strictEqual(error.descriptor, 'syntax');
            assert.strictEqual(error.message, '`syntax` descriptor value must be a string');
        });

        it('should fail on an unknown data type', () => {
            const error = checkPropertyRule('@property --x { syntax: "<lenght>"; inherits: false; initial-value: 0; }');

            assert.strictEqual(error.descriptor, 'syntax');
            assert(error.message.startsWith('Invalid `syntax` descriptor value: Unknown data type `<lenght>`'));
        });

        it('should fail on an invalid syntax string', () => {
            const error = checkPropertyRule('@property --x { syntax: "<length>+#"; inherits: false; initial-value: 0px; }');

            assert.strictEqual(error.descriptor, 'syntax');
            assert(error.message.startsWith('Invalid `syntax` descriptor value: Unexpected multiplier'));
        });

        it('should locate the error to the syntax declaration', () => {
            const error = checkPropertyRule('@property --x { syntax: "foo()"; inherits: false; initial-value: 0px; }');

            assert.strictEqual(error.node.type, 'Declaration');
            assert.strictEqual(error.node.property, 'syntax');
        });
    });

    describe('inherits descriptor', () => {
        it('should fail on a value other than true or false', () => {
            const error = checkPropertyRule('@property --x { syntax: "<length>"; inherits: maybe; initial-value: 0px; }');

            assert.strictEqual(error.descriptor, 'inherits');
            assert.strictEqual(error.message, '`inherits` descriptor value must be `true` or `false`');
        });

        it('should fail on a sequence of values', () => {
            const error = checkPropertyRule('@property --x { syntax: "<length>"; inherits: true false; initial-value: 0px; }');

            assert.strictEqual(error.descriptor, 'inherits');
        });

        it('keyword case doesn\'t matter', () => {
            assert.strictEqual(checkPropertyRule('@property --x { syntax: "<length>"; inherits: TRUE; initial-value: 0px; }'), undefined);
            assert.strictEqual(checkPropertyRule('@property --x { syntax: "<length>"; inherits: False; initial-value: 0px; }'), undefined);
        });
    });

    describe('initial-value descriptor', () => {
        it('should fail when the value doesn\'t match the syntax', () => {
            const error = checkPropertyRule('@property --x { syntax: "<length>"; inherits: false; initial-value: red; }');

            assert.strictEqual(error.descriptor, 'initial-value');
            assert.strictEqual(error.message, '`initial-value` descriptor value doesn\'t match the syntax "<length>"\n' +
                'Mismatch\n' +
                '  syntax: <length>\n' +
                '   value: red\n' +
                '  --------^');
        });

        it('an unitless zero doesn\'t match <length>', () => {
            const error = checkPropertyRule('@property --x { syntax: "<length>"; inherits: false; initial-value: 0; }');

            assert.strictEqual(error.descriptor, 'initial-value');
        });

        it('an unitless zero matches <number>', () => {
            const error = checkPropertyRule('@property --x { syntax: "<number>"; inherits: false; initial-value: 0; }');

            assert.strictEqual(error, undefined);
        });

        it('an unitless zero doesn\'t match <length-percentage>', () => {
            const error = checkPropertyRule('@property --x { syntax: "<length-percentage>"; inherits: false; initial-value: 0; }');

            assert.strictEqual(error.descriptor, 'initial-value');
        });

        it('should match alternatives', () => {
            assert.strictEqual(checkPropertyRule('@property --x { syntax: "<length> | <color>"; inherits: false; initial-value: red; }'), undefined);
            assert.strictEqual(checkPropertyRule('@property --x { syntax: "<length> | <color>"; inherits: false; initial-value: 1px; }'), undefined);
            assert(checkPropertyRule('@property --x { syntax: "<length> | <color>"; inherits: false; initial-value: 1; }'));
        });

        it('should match literals', () => {
            assert.strictEqual(checkPropertyRule('@property --x { syntax: "auto | <length>"; inherits: false; initial-value: auto; }'), undefined);
            assert(checkPropertyRule('@property --x { syntax: "auto | <length>"; inherits: false; initial-value: none; }'));
        });

        it('should match multipliers', () => {
            assert.strictEqual(checkPropertyRule('@property --x { syntax: "<length>+"; inherits: false; initial-value: 1px 2em; }'), undefined);
            assert.strictEqual(checkPropertyRule('@property --x { syntax: "<length>#"; inherits: false; initial-value: 1px, 2em; }'), undefined);
            assert(checkPropertyRule('@property --x { syntax: "<length>+"; inherits: false; initial-value: 1px, 2em; }'));
            assert(checkPropertyRule('@property --x { syntax: "<length>#"; inherits: false; initial-value: 1px 2em; }'));
        });

        it('should locate the error to the initial-value declaration', () => {
            const error = checkPropertyRule('@property --x { syntax: "<length>"; inherits: false; initial-value: red; }');

            assert.strictEqual(error.node.type, 'Declaration');
            assert.strictEqual(error.node.property, 'initial-value');
        });
    });
});
