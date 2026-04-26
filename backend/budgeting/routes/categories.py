import re
import pytz
from datetime import datetime, timezone
from flask import Blueprint, jsonify, request

from budgeting.extensions import db
from budgeting.models.transaction import CategoryRule
from budgeting.services.category_service import recategorize_all_transactions

categories_bp = Blueprint('categories', __name__)


@categories_bp.route('/api/category-rules', methods=['GET'])
def get_category_rules():
    try:
        rules = CategoryRule.query.filter_by(is_active=True).order_by(CategoryRule.category_name).all()
        return jsonify([
            {
                'id': rule.id,
                'category_name': rule.category_name,
                'regex_pattern': rule.regex_pattern,
                'is_active': rule.is_active,
                'created_at': rule.created_at.isoformat(),
                'updated_at': rule.updated_at.isoformat(),
            }
            for rule in rules
        ])
    except Exception as e:
        return jsonify({'error': f'Error fetching category rules: {str(e)}'}), 500


@categories_bp.route('/api/category-rules', methods=['POST'])
def create_category_rule():
    try:
        data = request.get_json()
        if not data or 'category_name' not in data or 'regex_pattern' not in data:
            return jsonify({'error': 'Category name and regex pattern are required'}), 400

        try:
            re.compile(data['regex_pattern'])
        except re.error:
            return jsonify({'error': 'Invalid regex pattern'}), 400

        rule = CategoryRule(
            category_name=data['category_name'].strip(),
            regex_pattern=data['regex_pattern'].strip(),
            is_active=data.get('is_active', True),
        )
        db.session.add(rule)
        db.session.commit()

        updated_count = recategorize_all_transactions()

        return jsonify({
            'id': rule.id,
            'category_name': rule.category_name,
            'regex_pattern': rule.regex_pattern,
            'is_active': rule.is_active,
            'created_at': rule.created_at.isoformat(),
            'updated_at': rule.updated_at.isoformat(),
            'updated_transactions': updated_count,
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Error creating category rule: {str(e)}'}), 500


@categories_bp.route('/api/category-rules/<int:rule_id>', methods=['PUT'])
def update_category_rule(rule_id):
    try:
        rule = CategoryRule.query.get_or_404(rule_id)
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        if 'regex_pattern' in data:
            try:
                re.compile(data['regex_pattern'])
            except re.error:
                return jsonify({'error': 'Invalid regex pattern'}), 400
            rule.regex_pattern = data['regex_pattern'].strip()

        if 'category_name' in data:
            rule.category_name = data['category_name'].strip()

        if 'is_active' in data:
            rule.is_active = data['is_active']

        rule.updated_at = datetime.now(timezone.utc)
        db.session.commit()

        updated_count = recategorize_all_transactions()

        return jsonify({
            'id': rule.id,
            'category_name': rule.category_name,
            'regex_pattern': rule.regex_pattern,
            'is_active': rule.is_active,
            'created_at': rule.created_at.isoformat(),
            'updated_at': rule.updated_at.isoformat(),
            'updated_transactions': updated_count,
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Error updating category rule: {str(e)}'}), 500


@categories_bp.route('/api/category-rules/<int:rule_id>', methods=['DELETE'])
def delete_category_rule(rule_id):
    try:
        rule = CategoryRule.query.get_or_404(rule_id)
        rule.is_active = False
        rule.updated_at = datetime.now(timezone.utc)
        db.session.commit()
        return jsonify({'message': 'Category rule deleted successfully'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Error deleting category rule: {str(e)}'}), 500


@categories_bp.route('/api/category-names', methods=['GET'])
def get_category_names():
    """Return distinct category names from both CategoryRule and BillCategory."""
    try:
        from budgeting.models.bill import BillCategory
        rule_names = {r.category_name for r in CategoryRule.query.filter_by(is_active=True).all()}
        bill_cat_names = {c.name for c in BillCategory.query.all()}
        merged = sorted(rule_names | bill_cat_names, key=str.lower)
        return jsonify(merged)
    except Exception as e:
        return jsonify({'error': f'Error fetching category names: {str(e)}'}), 500


@categories_bp.route('/api/category-rules/export', methods=['GET'])
def export_category_rules():
    try:
        rules = CategoryRule.query.filter_by(is_active=True).all()
        tzinfo = pytz.timezone("America/Chicago")
        return jsonify({
            'version': '1.0',
            'exported_at': datetime.now(tzinfo).strftime("%Y-%m-%dT%H:%M:%S"),
            'rules': [
                {
                    'category_name': rule.category_name,
                    'regex_pattern': rule.regex_pattern,
                    'is_active': rule.is_active,
                }
                for rule in rules
            ],
        })
    except Exception as e:
        return jsonify({'error': f'Error exporting category rules: {str(e)}'}), 500


@categories_bp.route('/api/category-rules/import', methods=['POST'])
def import_category_rules():
    try:
        data = request.get_json()
        if not data or 'rules' not in data:
            return jsonify({'error': 'Invalid import data format'}), 400

        imported_count = 0
        skipped_count = 0

        for rule_data in data['rules']:
            if not all(key in rule_data for key in ['category_name', 'regex_pattern']):
                skipped_count += 1
                continue

            existing = CategoryRule.query.filter_by(
                category_name=rule_data['category_name'],
                regex_pattern=rule_data['regex_pattern'],
            ).first()
            if existing:
                skipped_count += 1
                continue

            try:
                re.compile(rule_data['regex_pattern'])
            except re.error:
                skipped_count += 1
                continue

            db.session.add(CategoryRule(
                category_name=rule_data['category_name'].strip(),
                regex_pattern=rule_data['regex_pattern'].strip(),
                is_active=rule_data.get('is_active', True),
            ))
            imported_count += 1

        db.session.commit()
        updated_count = recategorize_all_transactions()

        return jsonify({
            'message': f'Successfully imported {imported_count} rules, skipped {skipped_count} duplicates/invalid',
            'imported_count': imported_count,
            'skipped_count': skipped_count,
            'updated_transactions': updated_count,
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Error importing category rules: {str(e)}'}), 500
