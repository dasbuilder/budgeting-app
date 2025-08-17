import os
import re
import uuid
from datetime import datetime
from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
import pandas as pd
from werkzeug.utils import secure_filename
import tempfile
from sqlalchemy import text

app = Flask(__name__)
CORS(app)  # Allow all origins for development

# Database configuration with SQLCipher for encryption
# For development, we'll use regular SQLite and add encryption later
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///budgeting_app.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

db = SQLAlchemy(app)

# Database Models
class Transaction(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    transaction_date = db.Column(db.DateTime, nullable=False)
    post_date = db.Column(db.DateTime, nullable=True)
    description = db.Column(db.String(500), nullable=False)
    category = db.Column(db.String(100), nullable=True)
    transaction_type = db.Column(db.String(50), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    memo = db.Column(db.String(500), nullable=True)
    auto_category = db.Column(db.String(100), nullable=True)  # Auto-categorized
    manual_category = db.Column(db.String(100), nullable=True)  # Manual override
    balance = db.Column(db.Float, nullable=True)
    check_number = db.Column(db.String(50), nullable=True)
    csv_format = db.Column(db.String(20), nullable=False)  # 'format1' or 'format2'
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class CategoryRule(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    category_name = db.Column(db.String(100), nullable=False)
    regex_pattern = db.Column(db.String(500), nullable=False)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

# Helper functions
def detect_csv_format(df):
    """Detect which CSV format is being used"""
    columns = [col.lower().strip() for col in df.columns]
    
    # Format 1 columns
    format1_indicators = ['transaction date', 'post date', 'description', 'category', 'type', 'amount', 'memo']
    format2_indicators = ['details', 'posting date', 'description', 'amount', 'type', 'balance', 'check or slip #']
    
    format1_matches = sum(1 for indicator in format1_indicators if any(indicator in col for col in columns))
    format2_matches = sum(1 for indicator in format2_indicators if any(indicator in col for col in columns))
    
    return 'format1' if format1_matches >= format2_matches else 'format2'

def parse_date(date_str):
    """Parse various date formats"""
    if pd.isna(date_str) or date_str == '':
        return None
    
    # Common date formats to try
    date_formats = [
        '%m/%d/%Y',
        '%m-%d-%Y',
        '%Y-%m-%d',
        '%m/%d/%y',
        '%m-%d-%y',
        '%Y/%m/%d',
    ]
    
    for fmt in date_formats:
        try:
            return datetime.strptime(str(date_str).strip(), fmt)
        except ValueError:
            continue
    
    # If all else fails, try pandas parsing
    try:
        return pd.to_datetime(date_str)
    except:
        return None

def process_csv_format1(df):
    """Process CSV format 1"""
    transactions = []
    
    for _, row in df.iterrows():
        transaction = Transaction(
            transaction_date=parse_date(row.get('Transaction Date', '')),
            post_date=parse_date(row.get('Post Date', '')),
            description=str(row.get('Description', '')).strip(),
            category=str(row.get('Category', '')).strip(),
            transaction_type=str(row.get('Type', '')).strip(),
            amount=float(row.get('Amount', 0)),
            memo=str(row.get('Memo', '')).strip(),
            csv_format='format1'
        )
        transactions.append(transaction)
    
    return transactions

def process_csv_format2(df):
    """Process CSV format 2"""
    transactions = []
    
    for _, row in df.iterrows():
        transaction = Transaction(
            transaction_date=parse_date(row.get('Posting Date', '')),
            post_date=parse_date(row.get('Posting Date', '')),  # Same as transaction date for format2
            description=str(row.get('Description', '')).strip(),
            category='',  # Format2 doesn't have category
            transaction_type=str(row.get('Type', '')).strip(),
            amount=float(row.get('Amount', 0)),
            memo=str(row.get('Details', '')).strip(),
            balance=float(row.get('Balance', 0)) if row.get('Balance') and str(row.get('Balance')).strip() else None,
            check_number=str(row.get('Check or Slip #', '')).strip(),
            csv_format='format2'
        )
        transactions.append(transaction)
    
    return transactions

def auto_categorize_transaction(description, memo=''):
    """Auto-categorize a transaction based on regex rules"""
    rules = CategoryRule.query.filter_by(is_active=True).all()
    
    text_to_match = f"{description} {memo}".lower()
    
    for rule in rules:
        try:
            if re.search(rule.regex_pattern.lower(), text_to_match):
                return rule.category_name
        except re.error:
            # Skip invalid regex patterns
            continue
    
    return 'Uncategorized'

def recategorize_all_transactions():
    """Re-categorize all existing transactions based on current rules"""
    try:
        transactions = Transaction.query.all()
        updated_count = 0
        
        for transaction in transactions:
            old_category = transaction.auto_category
            new_category = auto_categorize_transaction(
                transaction.description, 
                transaction.memo or ''
            )
            
            if old_category != new_category:
                transaction.auto_category = new_category
                # Only update manual_category if it was None (not manually set)
                if transaction.manual_category is None:
                    updated_count += 1
                    print(f"Updated: {transaction.description[:50]} -> {new_category}")
        
        db.session.commit()
        print(f"Re-categorized {updated_count} transactions")
        return updated_count
        
    except Exception as e:
        db.session.rollback()
        print(f"Error re-categorizing transactions: {e}")
        return 0

# API Routes
@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'healthy'})

@app.route('/api/upload-csv', methods=['POST'])
def upload_csv():
    try:
        print(f"Received upload request. Files: {list(request.files.keys())}")
        print(f"Form data: {dict(request.form)}")
        
        if 'file' not in request.files:
            print("No file in request")
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        print(f"File received: {file.filename}, content type: {file.content_type}")
        
        if file.filename == '':
            print("Empty filename")
            return jsonify({'error': 'No file selected'}), 400
        
        if not file.filename.lower().endswith('.csv'):
            print(f"Invalid file type: {file.filename}")
            return jsonify({'error': 'Only CSV files are allowed'}), 400
        
        # Save file temporarily
        filename = secure_filename(file.filename)
        temp_path = os.path.join(tempfile.gettempdir(), f"{uuid.uuid4()}_{filename}")
        print(f"Saving file to: {temp_path}")
        file.save(temp_path)
        
        try:
            # Read CSV with explicit parameters to avoid parsing issues
            print("Reading CSV file...")
            df = pd.read_csv(temp_path, header=0, index_col=False)
            print(f"CSV loaded successfully. Shape: {df.shape}")
            print(f"Columns: {list(df.columns)}")
            print(f"First few rows:\n{df.head()}")
            
            if df.empty:
                return jsonify({'error': 'CSV file is empty'}), 400
            
            # Detect format
            csv_format = detect_csv_format(df)
            print(f"Detected format: {csv_format}")
            
            # Process based on format
            if csv_format == 'format1':
                transactions = process_csv_format1(df)
            else:
                transactions = process_csv_format2(df)
            
            print(f"Processed {len(transactions)} transactions")
            
            # Auto-categorize and save transactions
            saved_count = 0
            for transaction in transactions:
                if transaction.transaction_date:  # Only save if we have a valid date
                    # Auto-categorize
                    transaction.auto_category = auto_categorize_transaction(
                        transaction.description, 
                        transaction.memo or ''
                    )
                    
                    db.session.add(transaction)
                    saved_count += 1
            
            db.session.commit()
            print(f"Successfully saved {saved_count} transactions")
            
            return jsonify({
                'message': f'Successfully imported {saved_count} transactions',
                'format_detected': csv_format,
                'total_rows': len(df),
                'saved_transactions': saved_count
            })
            
        finally:
            # Clean up temp file
            if os.path.exists(temp_path):
                os.remove(temp_path)
                print(f"Cleaned up temp file: {temp_path}")
                
    except Exception as e:
        print(f"Error processing file: {str(e)}")
        print(f"Error type: {type(e)}")
        import traceback
        traceback.print_exc()
        db.session.rollback()
        return jsonify({'error': f'Error processing file: {str(e)}'}), 500

@app.route('/api/transactions', methods=['GET'])
def get_transactions():
    try:
        # Query parameters
        transaction_type = request.args.get('type')
        category = request.args.get('category')
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 100))
        
        # Build query
        query = Transaction.query
        
        if transaction_type:
            query = query.filter(Transaction.transaction_type.ilike(f'%{transaction_type}%'))
        
        if category:
            query = query.filter(
                db.or_(
                    Transaction.manual_category.ilike(f'%{category}%'),
                    Transaction.auto_category.ilike(f'%{category}%')
                )
            )
        
        if start_date:
            start_dt = datetime.strptime(start_date, '%Y-%m-%d')
            query = query.filter(Transaction.transaction_date >= start_dt)
        
        if end_date:
            end_dt = datetime.strptime(end_date, '%Y-%m-%d')
            query = query.filter(Transaction.transaction_date <= end_dt)
        
        # Order by date (newest first)
        query = query.order_by(Transaction.transaction_date.desc())
        
        # Paginate
        transactions = query.paginate(page=page, per_page=per_page, error_out=False)
        
        result = {
            'transactions': [
                {
                    'id': t.id,
                    'transaction_date': t.transaction_date.isoformat() if t.transaction_date else None,
                    'post_date': t.post_date.isoformat() if t.post_date else None,
                    'description': t.description,
                    'category': t.manual_category or t.auto_category,
                    'auto_category': t.auto_category,
                    'manual_category': t.manual_category,
                    'transaction_type': t.transaction_type,
                    'amount': t.amount,
                    'memo': t.memo,
                    'balance': t.balance,
                    'check_number': t.check_number,
                    'csv_format': t.csv_format
                }
                for t in transactions.items
            ],
            'pagination': {
                'page': transactions.page,
                'pages': transactions.pages,
                'per_page': transactions.per_page,
                'total': transactions.total
            }
        }
        
        return jsonify(result)
        
    except Exception as e:
        return jsonify({'error': f'Error fetching transactions: {str(e)}'}), 500

@app.route('/api/category-rules', methods=['GET'])
def get_category_rules():
    try:
        rules = CategoryRule.query.filter_by(is_active=True).order_by(CategoryRule.category_name).all()
        
        result = [
            {
                'id': rule.id,
                'category_name': rule.category_name,
                'regex_pattern': rule.regex_pattern,
                'is_active': rule.is_active,
                'created_at': rule.created_at.isoformat(),
                'updated_at': rule.updated_at.isoformat()
            }
            for rule in rules
        ]
        
        return jsonify(result)
        
    except Exception as e:
        return jsonify({'error': f'Error fetching category rules: {str(e)}'}), 500

@app.route('/api/category-rules', methods=['POST'])
def create_category_rule():
    try:
        data = request.get_json()
        
        if not data or 'category_name' not in data or 'regex_pattern' not in data:
            return jsonify({'error': 'Category name and regex pattern are required'}), 400
        
        # Test if regex is valid
        try:
            re.compile(data['regex_pattern'])
        except re.error:
            return jsonify({'error': 'Invalid regex pattern'}), 400
        
        rule = CategoryRule(
            category_name=data['category_name'].strip(),
            regex_pattern=data['regex_pattern'].strip(),
            is_active=data.get('is_active', True)
        )
        
        db.session.add(rule)
        db.session.commit()
        
        # Re-categorize all transactions with new rule
        updated_count = recategorize_all_transactions()
        
        return jsonify({
            'id': rule.id,
            'category_name': rule.category_name,
            'regex_pattern': rule.regex_pattern,
            'is_active': rule.is_active,
            'created_at': rule.created_at.isoformat(),
            'updated_at': rule.updated_at.isoformat(),
            'updated_transactions': updated_count
        }), 201
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Error creating category rule: {str(e)}'}), 500

@app.route('/api/category-rules/<int:rule_id>', methods=['PUT'])
def update_category_rule(rule_id):
    try:
        rule = CategoryRule.query.get_or_404(rule_id)
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        # Test if regex is valid if provided
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
        
        rule.updated_at = datetime.utcnow()
        db.session.commit()
        
        # Re-categorize all transactions with updated rules
        updated_count = recategorize_all_transactions()
        
        return jsonify({
            'id': rule.id,
            'category_name': rule.category_name,
            'regex_pattern': rule.regex_pattern,
            'is_active': rule.is_active,
            'created_at': rule.created_at.isoformat(),
            'updated_at': rule.updated_at.isoformat(),
            'updated_transactions': updated_count
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Error updating category rule: {str(e)}'}), 500

@app.route('/api/category-rules/<int:rule_id>', methods=['DELETE'])
def delete_category_rule(rule_id):
    try:
        rule = CategoryRule.query.get_or_404(rule_id)
        
        # Soft delete by setting is_active to False
        rule.is_active = False
        rule.updated_at = datetime.utcnow()
        db.session.commit()
        
        return jsonify({'message': 'Category rule deleted successfully'})
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Error deleting category rule: {str(e)}'}), 500

@app.route('/api/recategorize-all', methods=['POST'])
def recategorize_all_endpoint():
    """Manual endpoint to re-categorize all transactions"""
    try:
        updated_count = recategorize_all_transactions()
        
        return jsonify({
            'message': f'Successfully re-categorized {updated_count} transactions',
            'updated_count': updated_count
        })
        
    except Exception as e:
        return jsonify({'error': f'Error re-categorizing transactions: {str(e)}'}), 500

@app.route('/api/clear-database', methods=['DELETE'])
def clear_database():
    """Clear all transactions from the database (keep category rules)"""
    try:
        # Count transactions before deletion
        transaction_count = Transaction.query.count()
        
        # Delete all transactions
        Transaction.query.delete()
        db.session.commit()
        
        print(f"Cleared {transaction_count} transactions from database")
        
        return jsonify({
            'message': f'Successfully cleared {transaction_count} transactions from database',
            'cleared_count': transaction_count
        })
        
    except Exception as e:
        db.session.rollback()
        print(f"Error clearing database: {str(e)}")
        return jsonify({'error': f'Error clearing database: {str(e)}'}), 500

@app.route('/api/stats', methods=['GET'])
def get_stats():
    """Get basic statistics about transactions"""
    try:
        total_transactions = Transaction.query.count()
        
        # Get date range
        date_range = db.session.query(
            db.func.min(Transaction.transaction_date),
            db.func.max(Transaction.transaction_date)
        ).first()
        
        # Get categories summary
        categories = db.session.query(
            db.func.coalesce(Transaction.manual_category, Transaction.auto_category).label('category'),
            db.func.count().label('count'),
            db.func.sum(Transaction.amount).label('total_amount')
        ).group_by(
            db.func.coalesce(Transaction.manual_category, Transaction.auto_category)
        ).all()
        
        return jsonify({
            'total_transactions': total_transactions,
            'date_range': {
                'earliest': date_range[0].isoformat() if date_range[0] else None,
                'latest': date_range[1].isoformat() if date_range[1] else None
            },
            'categories': [
                {
                    'category': cat.category,
                    'count': cat.count,
                    'total_amount': float(cat.total_amount)
                }
                for cat in categories
            ]
        })
        
    except Exception as e:
        return jsonify({'error': f'Error fetching stats: {str(e)}'}), 500

# Initialize database
# Add this at the bottom of your app.py file, before if __name__ == '__main__':
def create_tables():
    with app.app_context():
        db.create_all()
        
        # Add some default category rules if none exist
        if CategoryRule.query.count() == 0:
            default_rules = [
                CategoryRule(category_name='Groceries', regex_pattern=r'grocery|supermarket|food|kroger|walmart|target.*food|whole foods|trader joe|safeway'),
                CategoryRule(category_name='Eating Out', regex_pattern=r'restaurant|mcdonald|burger|pizza|taco|subway|starbucks|coffee|cafe|diner'),
                CategoryRule(category_name='Fuel', regex_pattern=r'gas|fuel|shell|exxon|bp|chevron|mobil|station'),
                CategoryRule(category_name='Shopping', regex_pattern=r'amazon|ebay|store|shop|retail|mall|target(?!.*food)|walmart(?!.*food)|costco'),
                CategoryRule(category_name='Utilities', regex_pattern=r'electric|water|gas company|utility|phone|internet|cable'),
                CategoryRule(category_name='Transportation', regex_pattern=r'uber|lyft|taxi|bus|train|parking|toll')
            ]
            
            for rule in default_rules:
                db.session.add(rule)
            
            db.session.commit()

# Then update the if __name__ == '__main__' block:
if __name__ == '__main__':
    create_tables()  # Call this once when starting the app
    app.run(debug=True, port=5000)