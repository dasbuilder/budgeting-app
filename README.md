# Personal Budgeting App

A comprehensive financial budgeting application built with NextJS frontend and Flask backend. Features drag-and-drop CSV import, automatic transaction categorization using regex patterns, filtering, and expense analysis.

## Note

This is my first vibe coded app, so the security is without warranty 

## Features

- **CSV Import**: Drag and drop CSV files with automatic format detection
- **Smart Categorization**: Define regex patterns to automatically categorize transactions
- **Filtering**: Filter transactions by date range, category, and transaction type
- **Statistics**: View spending summaries and category breakdowns
- **Secure**: Input validation, file size limits, and secure file handling
- **Responsive**: Mobile-friendly interface built with Tailwind CSS

## Tech Stack

- **Frontend**: Next.js 15, TypeScript, Tailwind CSS
- **Backend**: Flask, SQLAlchemy, pandas
- **Database**: SQLite (with encryption support)
- **File Processing**: pandas for CSV parsing
- **UI Components**: Headless UI, Heroicons

## Project Structure

```text
budgeting-app/
├── backend/
│   ├── app.py              # Flask application
│   └── requirements.txt    # Python dependencies
│
├── instance
│   └── budgeting_app.db   # SQLite database (created on first run)
│
├── frontend/
│   ├── pages/
│   │   ├── index.tsx      # Main application page
│   │   └── _app.tsx       # App layout
│   ├── components/        # React components
│   ├── services/          # API service layer
│   ├── types/             # TypeScript type definitions
│   ├── styles/            # CSS styles
│   ├── package.json
│   ├── tailwind.config.js
│   ├── next.config.js
│   └── tsconfig.json
│
└── README.md
```

## Setup Instructions

### Backend Setup

1. **Create a virtual environment**:

   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. **Install dependencies**:

   ```bash
   pip install -r requirements.txt
   ```

3. **Run the Flask server**:

   ```bash
   python app.py
   ```

   The API will be available at `http://localhost:5000`

### Frontend Setup

1. **Install dependencies**:

   ```bash
   cd frontend
   npm install -D tailwindcss@3.4.3 postcss@8.4.38 autoprefixer@10.4.19
   ```

2. **Install additional required dependencies**:

   ```bash
   npm install @tailwindcss/forms 
   ```

3. **Run the development server**:

   ```bash
   npm run dev
   ```

   The application will be available at `http://127.0.0.1:3000`

## CSV File Formats

The application supports two CSV formats:

### Format 1

```text
Transaction Date, Post Date, Description, Category, Type, Amount, Memo
```

### Format 2

```text
Details, Posting Date, Description, Amount, Type, Balance, Check or Slip #
```

The app automatically detects which format you're using.

## Usage

1. **Upload CSV**: Start by uploading your bank transaction CSV files
2. **Set Category Rules**: Define regex patterns to automatically categorize transactions
3. **Filter & Analyze**: Use filters to view specific date ranges or categories
4. **Review Statistics**: View spending summaries and category breakdowns

## Category Rules Examples

- **Groceries**: `walmart|target|grocery|kroger|safeway`
- **Restaurants**: `restaurant|mcdonald|burger|pizza|cafe`
- **Gas**: `gas|fuel|shell|exxon|bp|chevron`
- **Utilities**: `electric|water|gas company|utility|phone|internet`

## Security Features

- File type validation (CSV only)
- File size limits (16MB max)
- Input sanitization and validation
- Secure file handling with automatic cleanup
- Database encryption support (SQLCipher)

## Future Enhancements

- PDF report generation
- Budget setting and tracking
- Data export capabilities
- Enhanced visualizations
- Multi-user support with authentication
- Docker containerization for Raspberry Pi deployment

## Development Notes

- The database will be created automatically on first run
- Default category rules are seeded on startup
- All uploaded files are processed in memory and temporary files are cleaned up
- The API includes comprehensive error handling and validation

## Environment Variables

### Frontend (.env.local)
```
NEXT_PUBLIC_API_URL=http://127.0.0.1:5000/api
```

### Backend
```
FLASK_ENV=development
FLASK_DEBUG=True
```

## API Endpoints

- `GET /api/health` - Health check
- `POST /api/upload-csv` - Upload CSV file
- `GET /api/transactions` - Get transactions with filtering
- `GET /api/category-rules` - Get category rules
- `POST /api/category-rules` - Create category rule
- `PUT /api/category-rules/:id` - Update category rule
- `DELETE /api/category-rules/:id` - Delete category rule
- `GET /api/stats` - Get transaction statistics

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is for personal use. Please respect financial data privacy and security best practices.