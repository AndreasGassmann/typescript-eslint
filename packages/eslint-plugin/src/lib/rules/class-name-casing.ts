/**
 * @fileoverview Enforces PascalCased class and interface names.
 * @author Jed Fox
 * @author Armano <https://github.com/armano2>
 */

import { Rule } from 'eslint';
import * as util from '../util';

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Require PascalCased class and interface names',
      extraDescription: [util.tslintRule('class-name')],
      category: 'Best Practices',
      url: util.metaDocsUrl('class-name-casing'),
      recommended: 'error'
    },
    schema: []
  },

  create(context: Rule.RuleContext) {
    // variables should be defined here

    //----------------------------------------------------------------------
    // Helpers
    //----------------------------------------------------------------------

    /**
     * Determine if the identifier name is PascalCased
     * @param name The identifier name
     */
    function isPascalCase(name: string): boolean {
      return /^[A-Z][0-9A-Za-z]*$/.test(name);
    }

    /**
     * Report a class declaration as invalid
     * @param {Node} decl The declaration
     * @param {Node} [id=classDecl.id] The name of the declaration
     */
    function report(decl, id): void {
      const resolvedId = id || decl.id;

      let friendlyName;

      switch (decl.type) {
        case 'ClassDeclaration':
        case 'ClassExpression':
          friendlyName = decl.abstract ? 'Abstract class' : 'Class';
          break;
        case 'TSInterfaceDeclaration':
          friendlyName = 'Interface';
          break;
        default:
          friendlyName = decl.type;
      }

      context.report({
        node: resolvedId,
        message: "{{friendlyName}} '{{name}}' must be PascalCased.",
        data: {
          friendlyName,
          name: resolvedId.name
        }
      });
    }

    //----------------------------------------------------------------------
    // Public
    //----------------------------------------------------------------------

    return {
      'ClassDeclaration, TSInterfaceDeclaration, ClassExpression'(node) {
        // class expressions (i.e. export default class {}) are OK
        if (node.id && !isPascalCase(node.id.name)) {
          report(node);
        }
      },
      "VariableDeclarator[init.type='ClassExpression']"(node) {
        const id = node.id;

        if (id && !node.init.id && !isPascalCase(id.name)) {
          report(node.init, id);
        }
      }
    };
  }
};
export = rule;