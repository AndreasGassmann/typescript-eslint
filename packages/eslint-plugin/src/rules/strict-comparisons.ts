import { TSESTree } from '@typescript-eslint/typescript-estree';
import { isUnionType, isTypeFlagSet } from 'tsutils';
import ts from 'typescript';

import * as util from '../util';

interface Config {
  allowObjectEqualComparison: boolean;
  allowStringOrderComparison: boolean;
}

type Options = [Config];

type MessageIds = 'nonComparableTypes' | 'invalidTypeForOperator';

export default util.createRule<Options, MessageIds>({
  name: 'strict-comparisons',
  meta: {
    type: 'problem',
    docs: {
      category: 'Best Practices',
      description: 'Only allow comparisons between primitive types.',
      tslintRuleName: 'object-comparison',
      recommended: 'error',
    },
    messages: {
      nonComparableTypes:
        "cannot compare type '{{ typesLeft }}' to type '{{ typesRight }}'",
      invalidTypeForOperator:
        "cannot use '{{ comparator }}' comparator for type '{{ type }}'",
    },
    schema: [
      {
        type: 'object',
        properties: {
          allowObjectEqualComparison: {
            type: 'boolean',
          },
          allowStringOrderComparison: {
            type: 'boolean',
          },
        },
        additionalProperties: false,
      },
    ],
  },
  defaultOptions: [
    {
      allowObjectEqualComparison: false,
      allowStringOrderComparison: false,
    },
  ],
  create(
    context,
    [{ allowObjectEqualComparison, allowStringOrderComparison }],
  ) {
    const service = util.getParserServices(context);

    const typeChecker = service.program.getTypeChecker();

    const enum TypeKind {
      Any = 0,
      Number = 1,
      Enum = 2,
      String = 3,
      Boolean = 4,
      NullOrUndefined = 5,
      Object = 6,
    }

    const typeNames = {
      [TypeKind.Any]: 'any',
      [TypeKind.Number]: 'number',
      [TypeKind.Enum]: 'enum',
      [TypeKind.String]: 'string',
      [TypeKind.Boolean]: 'boolean',
      [TypeKind.NullOrUndefined]: 'null | undefined',
      [TypeKind.Object]: 'object',
    };

    /**
     * Get TypeKinds of a typescript type
     * @param type
     */
    function getKinds(type: ts.Type): TypeKind[] {
      return isUnionType(type)
        ? Array.from(new Set(type.types.map(getKind)))
        : [getKind(type)];
    }

    /**
     * Get TypeKind of a typescript type
     * @param type
     */

    function getKind(type: ts.Type): TypeKind {
      // tslint:disable:no-bitwise
      return is(ts.TypeFlags.String | ts.TypeFlags.StringLiteral)
        ? TypeKind.String
        : is(ts.TypeFlags.Number | ts.TypeFlags.NumberLiteral)
        ? TypeKind.Number
        : is(ts.TypeFlags.BooleanLike)
        ? TypeKind.Boolean
        : is(ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void)
        ? TypeKind.NullOrUndefined
        : is(ts.TypeFlags.Any)
        ? TypeKind.Any
        : TypeKind.Object;
      // tslint:enable:no-bitwise

      function is(flags: ts.TypeFlags) {
        return isTypeFlagSet(type, flags);
      }
    }

    /**
     * Check if a specific TypeKind is present in an array
     * @param typesLeft array of TypeKinds
     * @param typesRight TypeKind to check
     */
    function getStrictestComparableType(
      typesLeft: TypeKind[],
      typesRight: TypeKind[],
    ): TypeKind | undefined {
      const overlappingTypes = typesLeft.filter(
        type => typesRight.indexOf(type) >= 0,
      );

      if (overlappingTypes.length > 0) {
        return getStrictestKind(overlappingTypes);
      } else {
        // In case one of the types is "any", get the strictest type of the other array
        if (arrayContainsKind(typesLeft, TypeKind.Any)) {
          return getStrictestKind(typesRight);
        }
        if (arrayContainsKind(typesRight, TypeKind.Any)) {
          return getStrictestKind(typesLeft);
        }

        // In case one array contains NullOrUndefined and the other an Object, return Object
        if (
          (arrayContainsKind(typesLeft, TypeKind.NullOrUndefined) &&
            arrayContainsKind(typesRight, TypeKind.Object)) ||
          (arrayContainsKind(typesRight, TypeKind.NullOrUndefined) &&
            arrayContainsKind(typesLeft, TypeKind.Object))
        ) {
          return TypeKind.Object;
        }
        return undefined;
      }
    }

    /**
     * Check if a specific TypeKind is present in an array
     * @param types array of TypeKinds
     * @param typeToCheck TypeKind to check
     */
    function arrayContainsKind(
      types: TypeKind[],
      typeToCheck: TypeKind,
    ): boolean {
      return types.some(type => type === typeToCheck);
    }

    /**
     * Return the strictest kind of an array
     * @param types array of TypeKinds
     */
    function getStrictestKind(types: TypeKind[]): TypeKind {
      // tslint:disable-next-line:no-unsafe-any
      return Math.max.apply(Math, types);
    }

    /**
     * Check if the operator is a comparison operator
     * @param operator the operator to check
     */
    function isComparisonOperator(operator: string): boolean {
      if (isEqualityOperator(operator)) {
        return true;
      }
      switch (operator) {
        case '<':
        case '>':
        case '<=':
        case '>=':
          return true;
        default:
          return false;
      }
    }

    /**
     * Check if the operator is an equality operator
     * @param operator the operator to check
     */
    function isEqualityOperator(operator: string): boolean {
      switch (operator) {
        case '==':
        case '!=':
        case '===':
        case '!==':
          return true;
        default:
          return false;
      }
    }

    /**
     * Helper function to get base type of node
     * @param node the node to be evaluated.
     */
    function getNodeType(node: TSESTree.Node): ts.Type {
      const tsNode = service.esTreeNodeToTSNodeMap.get(node);
      return typeChecker.getTypeAtLocation(tsNode);
    }

    return {
      BinaryExpression(node: TSESTree.BinaryExpression) {
        if (isComparisonOperator(node.operator)) {
          const leftType = getNodeType(node.left);
          const rightType = getNodeType(node.right);

          const leftKinds: TypeKind[] = getKinds(leftType);
          const rightKinds: TypeKind[] = getKinds(rightType);

          const operandKind = getStrictestComparableType(leftKinds, rightKinds);

          if (operandKind === undefined) {
            context.report({
              node,
              messageId: 'nonComparableTypes',
              data: {
                typesLeft: leftKinds.map(type => typeNames[type]).join(' | '),
                typesRight: rightKinds.map(type => typeNames[type]).join(' | '),
              },
            });
          } else {
            const isEquality = isEqualityOperator(node.operator);
            if (isEquality) {
              // Check !=, ==, !==, ===
              switch (operandKind) {
                case TypeKind.Any:
                case TypeKind.Number:
                case TypeKind.Enum:
                case TypeKind.String:
                case TypeKind.Boolean:
                  break;
                case TypeKind.NullOrUndefined:
                case TypeKind.Object:
                  if (allowObjectEqualComparison) {
                    break;
                  }
                  context.report({
                    node,
                    messageId: 'invalidTypeForOperator',
                    data: {
                      comparator: node.operator,
                      type: typeNames[operandKind],
                    },
                  });

                  break;
                default:
                  context.report({
                    node,
                    messageId: 'invalidTypeForOperator',
                    data: {
                      comparator: node.operator,
                      type: typeNames[operandKind],
                    },
                  });
              }
            } else {
              // Check >, <, >=, <=
              switch (operandKind) {
                case TypeKind.Any:
                case TypeKind.Number:
                  break;
                case TypeKind.String:
                  if (allowStringOrderComparison) {
                    break;
                  }
                  context.report({
                    node,
                    messageId: 'invalidTypeForOperator',
                    data: {
                      comparator: node.operator,
                      type: typeNames[operandKind],
                    },
                  });

                  break;
                default:
                  context.report({
                    node,
                    messageId: 'invalidTypeForOperator',
                    data: {
                      comparator: node.operator,
                      type: typeNames[operandKind],
                    },
                  });
              }
            }
          }
        }
      },
    };
  },
});
