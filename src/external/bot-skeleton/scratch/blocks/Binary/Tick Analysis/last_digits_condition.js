import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../../utils';

window.Blockly.Blocks.last_digits_condition = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Last {{ count }} digits are {{ condition }} digit {{ digit }}', {
                count: '%1',
                condition: '%2',
                digit: '%3',
            }),
            args0: [
                {
                    type: 'input_value',
                    name: 'COUNT',
                    check: 'Number',
                },
                {
                    type: 'field_dropdown',
                    name: 'CONDITION',
                    options: [
                        [localize('less than'), 'lt'],
                        [localize('greater than'), 'gt'],
                        [localize('equal to'), 'eq'],
                        [localize('different from'), 'neq'],
                    ],
                },
                {
                    type: 'input_value',
                    name: 'DIGIT',
                    check: 'Number',
                },
            ],
            output: 'Boolean',
            outputShape: window.Blockly.OUTPUT_SHAPE_ROUND,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize('Checks if the last N digits all meet the selected condition'),
            category: window.Blockly.Categories.Tick_Analysis,
        };
    },
    meta() {
        return {
            display_name: localize('Last Digits Condition'),
            description: localize('Checks if the last N digits meet the specified condition.'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.last_digits_condition = block => {
    const count =
        window.Blockly.JavaScript.javascriptGenerator.valueToCode(
            block,
            'COUNT',
            window.Blockly.JavaScript.javascriptGenerator.ORDER_NONE
        ) || 3;
    const digit =
        window.Blockly.JavaScript.javascriptGenerator.valueToCode(
            block,
            'DIGIT',
            window.Blockly.JavaScript.javascriptGenerator.ORDER_NONE
        ) || 4;
    const condition = block.getFieldValue('CONDITION');
    const operator_map = {
        eq: '===',
        gt: '>',
        lt: '<',
        neq: '!==',
    };
    const operator = operator_map[condition] || '<';

    return [
        `(function () {
            var digits = Bot.getLastDigitList().slice(-Math.max(1, Number(${count}) || 1));
            var target = Number(${digit});
            var index = 0;
            var result = true;
            if (!digits.length) {
                Bot.notify({
                    className: 'journal__text--analysis',
                    message: 'Waiting: Last ' + Number(${count}) + ' digits are not available yet.',
                    sound: '',
                    analysis_key: '${block.id}',
                });
                return false;
            }
            for (index = 0; index < digits.length; index += 1) {
                if (!(Number(digits[index]) ${operator} target)) {
                    result = false;
                    break;
                }
            }
            Bot.notify({
                className: 'journal__text--analysis',
                message: result
                    ? 'Condition met: Last ' + Number(${count}) + ' digits satisfy the selected rule for digit ' + target + '. Purchasing contract.'
                    : 'Waiting: Last ' + Number(${count}) + ' digits have not yet satisfied the selected rule for digit ' + target + '.',
                sound: '',
                analysis_key: '${block.id}',
            });
            return result;
        })()`,
        window.Blockly.JavaScript.javascriptGenerator.ORDER_FUNCTION_CALL,
    ];
};
