// Load environment variables from the project root .env file
const path = require('path');
require('dotenv').config(); // This will default to looking for .env in the current working directory
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet'); // For security headers
const rateLimit = require('express-rate-limit'); // For API rate limiting
const { body, validationResult } = require('express-validator'); // For input validation

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware ---
// Security Headers
app.use(helmet());

// CORS configuration
// This allows your frontend (running on localhost or a specific domain) to talk to this backend.
// In development, we allow common localhost ports. For production, specify your exact frontend URL.
app.use(cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:5500', 'http://localhost:8080'], // Add any other origins your frontend might run on
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

// Body parsers for incoming JSON and URL-encoded data
app.use(express.json({ limit: '10mb' })); // Handles JSON request bodies, increased limit
app.use(express.urlencoded({ extended: true })); // Handles URL-encoded form data

// Serve static files (your frontend HTML, CSS, JS from the 'public' directory)
// This assumes server.js is in the root, and 'public' is a sibling directory.
app.use(express.static(path.join(__dirname, 'public')));


// Rate Limiting (to prevent abuse of API endpoints)
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again after 15 minutes.'
});
app.use('/api/', apiLimiter); // Apply to all /api/ routes


// --- MongoDB Connection ---
const MONGO_URI = process.env.MONGO_URI;

// Crucial check: Ensure MONGO_URI is defined
if (!MONGO_URI) {
    console.error('FATAL ERROR: MONGO_URI is not defined in .env file!');
    process.exit(1); // Exit the process if URI is missing
}

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ Connected to MongoDB Atlas'))
    .catch(err => {
        console.error('❌ MongoDB connection error:', err);
        // Optionally exit the application if database connection is critical
        // process.exit(1);
    });

// --- MongoDB Schemas ---
const donorSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    age: { type: Number, required: true, min: 18, max: 65 }, // Added age from previous frontend
    bloodType: { 
        type: String, 
        required: true, 
        enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] 
    },
    phone: { type: String, required: true, trim: true, minlength: 10, maxlength: 15 },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    address: { type: String, required: true, trim: true, minlength: 10, maxlength: 200 },
    lastDonation: { type: Date, default: null },
    isActive: { type: Boolean, default: true }, // Keep this for soft deletes
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now } // Track updates
});

const inventorySchema = new mongoose.Schema({
    bloodType: { 
        type: String, 
        required: true, 
        enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] 
    },
    units: { type: Number, required: true, min: 1 }, // Added units
    donorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Donor', required: false }, // Made optional if not always from a tracked donor
    collectionDate: { type: Date, required: true },
    expiryDate: { type: Date, required: true },
    status: { type: String, default: 'available', enum: ['available', 'reserved', 'used', 'expired'] }, // Changed enum to lowercase for consistency
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const requestSchema = new mongoose.Schema({
    // Changed patientName and hospital to be direct fields from frontend
    patientName: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    bloodType: { 
        type: String, 
        required: true, 
        enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] 
    },
    units: { type: Number, required: true, min: 1 }, // Changed from unitsNeeded
    priority: { type: String, required: true, enum: ['Low', 'Medium', 'High', 'Critical'] },
    hospital: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    status: { type: String, default: 'pending', enum: ['pending', 'fulfilled', 'rejected', 'cancelled'] }, // Unified status terms
    requestDate: { type: Date, default: Date.now }, // Original request date
    processedBy: { type: String, trim: true }, // Who processed it
    processedDate: { type: Date }, // When it was processed
    createdAt: { type: Date, default: Date.now }, // When the record was created
    updatedAt: { type: Date, default: Date.now } // When the record was last updated
});

// Models
const Donor = mongoose.model('Donor', donorSchema);
const Inventory = mongoose.model('Inventory', inventorySchema);
const Request = mongoose.model('Request', requestSchema);

// --- Validation Middleware Functions ---
// These validators are reused from your previous server.js, they are very good!
const validateDonor = [
    body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters'),
    body('age').isInt({ min: 18, max: 65 }).withMessage('Age must be between 18 and 65'),
    body('bloodType').isIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).withMessage('Invalid blood type'),
    body('phone').trim().isLength({ min: 10, max: 15 }).withMessage('Phone number must be between 10 and 15 characters'),
    body('email').isEmail().normalizeEmail().withMessage('Invalid email address'),
    body('address').trim().isLength({ min: 10, max: 200 }).withMessage('Address must be between 10 and 200 characters')
];

const validateInventory = [
    body('bloodType').isIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).withMessage('Invalid blood type'),
    body('units').isInt({ min: 1 }).withMessage('Units must be at least 1'),
    body('donorId').optional().isMongoId().withMessage('Invalid Donor ID format'), // donorId is optional now
    body('collectionDate').isISO8601().withMessage('Invalid collection date format'),
    body('expiryDate').isISO8601().withMessage('Invalid expiry date format')
];

const validateRequest = [
    body('patientName').trim().isLength({ min: 2, max: 100 }).withMessage('Patient name must be between 2 and 100 characters'),
    body('bloodType').isIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).withMessage('Invalid blood type'),
    body('units').isInt({ min: 1 }).withMessage('Units needed must be at least 1'),
    body('priority').isIn(['Low', 'Medium', 'High', 'Critical']).withMessage('Invalid priority level'),
    body('hospital').trim().isLength({ min: 2, max: 100 }).withMessage('Hospital name must be between 2 and 100 characters')
];

// Reusable validation error handler
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: errors.array() // Provides detailed error messages from express-validator
        });
    }
    next();
};

// --- Helper Functions ---

// Function to mark expired blood units
const checkExpiredBlood = async () => {
    const now = new Date();
    await Inventory.updateMany(
        { expiryDate: { $lt: now }, status: 'available' },
        { $set: { status: 'expired' } } // Use $set to explicitly update status
    );
};


// --- API Routes ---

// Root endpoint: Serves your index.html from the 'public' folder
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health Check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        mongodb: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
        uptime: process.uptime() // Server uptime in seconds
    });
});

// Dashboard Stats
app.get('/api/stats', async (req, res) => {
    try {
        await checkExpiredBlood(); // Ensure expired units are marked before stats calculation

        const [totalDonors, totalInventoryUnits, pendingRequests, criticalLevels] = await Promise.all([
            Donor.countDocuments({ isActive: true }),
            Inventory.aggregate([
                { $match: { status: 'available' } },
                { $group: { _id: null, totalUnits: { $sum: '$units' } } }
            ]),
            Request.countDocuments({ status: 'pending' }),
            // Calculate critical levels by summing units for each blood type and counting those below threshold
            Inventory.aggregate([
                { $match: { status: 'available' } },
                { $group: { _id: '$bloodType', totalUnits: { $sum: '$units' } } },
                { $match: { totalUnits: { $lt: 5 } } }, // Threshold for critical (less than 5 units)
                { $count: 'criticalBloodTypes' }
            ])
        ]);

        res.json({
            success: true,
            data: {
                totalDonors: totalDonors,
                totalUnits: totalInventoryUnits.length > 0 ? totalInventoryUnits[0].totalUnits : 0,
                pendingRequests: pendingRequests,
                criticalLevels: criticalLevels.length > 0 ? criticalLevels[0].criticalBloodTypes : 0
            }
        });
    } catch (error) {
        console.error("Error fetching dashboard stats:", error);
        res.status(500).json({ success: false, error: 'Failed to fetch dashboard stats', details: error.message });
    }
});


// --- Donors API ---
app.get('/api/donors', async (req, res) => {
    try {
        const donors = await Donor.find({ isActive: true }).sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: donors }); // Consistent response format
    } catch (error) {
        console.error("Error fetching donors:", error);
        res.status(500).json({ success: false, error: 'Failed to fetch donors', details: error.message });
    }
});

app.post('/api/donors', validateDonor, handleValidationErrors, async (req, res) => {
    try {
        // Check for duplicate email
        const existingDonor = await Donor.findOne({ email: req.body.email });
        if (existingDonor) {
            return res.status(400).json({ success: false, error: 'A donor with this email already exists.' });
        }

        const donor = new Donor(req.body);
        await donor.save();
        res.status(201).json({ success: true, message: 'Donor registered successfully!', data: donor }); // Consistent response format
    } catch (error) {
        console.error("Error creating donor:", error);
        res.status(500).json({ success: false, error: 'Failed to register donor', details: error.message });
    }
});

app.delete('/api/donors/:id', async (req, res) => {
    try {
        // Implement soft delete by setting isActive to false
        const donor = await Donor.findByIdAndUpdate(req.params.id, { isActive: false, updatedAt: new Date() }, { new: true });
        if (!donor) {
            return res.status(404).json({ success: false, error: 'Donor not found.' });
        }
        res.status(200).json({ success: true, message: 'Donor marked as inactive successfully.', data: donor });
    } catch (error) {
        console.error("Error deleting donor (soft):", error);
        res.status(500).json({ success: false, error: 'Failed to delete donor', details: error.message });
    }
});


// --- Inventory API ---
app.get('/api/inventory', async (req, res) => {
    try {
        await checkExpiredBlood(); // Mark expired units before fetching
        const inventory = await Inventory.find()
            .populate('donorId', 'name bloodType') // Populate donor information
            .sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: inventory }); // Consistent response format
    } catch (error) {
        console.error("Error fetching inventory:", error);
        res.status(500).json({ success: false, error: 'Failed to fetch inventory', details: error.message });
    }
});

app.post('/api/inventory', validateInventory, handleValidationErrors, async (req, res) => {
    try {
        const { bloodType, donorId, collectionDate, units, expiryDate } = req.body;
        
        // If expiryDate is provided by frontend, use it. Otherwise, calculate (35 days from collection)
        const finalExpiryDate = expiryDate ? new Date(expiryDate) : new Date(new Date(collectionDate).setDate(new Date(collectionDate).getDate() + 35));

        const bloodUnit = new Inventory({
            bloodType,
            units, // Include units from req.body
            donorId: donorId || null, // Allow donorId to be optional in schema
            collectionDate,
            expiryDate: finalExpiryDate
        });
        
        await bloodUnit.save();
        
        // Attempt to update donor's last donation date if donorId is present
        if (donorId) {
            try {
                const donor = await Donor.findById(donorId);
                if (donor && new Date(collectionDate) > (donor.lastDonation || 0)) { // Only update if newer
                    donor.lastDonation = collectionDate;
                    donor.updatedAt = new Date();
                    await donor.save();
                }
            } catch (donorUpdateError) {
                console.warn(`Could not update lastDonation for donor ${donorId}:`, donorUpdateError.message);
                // Continue execution even if donor update fails, as blood unit is saved
            }
        }
        
        res.status(201).json({ success: true, message: 'Blood unit added successfully!', data: bloodUnit }); // Consistent response format
    } catch (error) {
        console.error("Error adding inventory item:", error);
        res.status(500).json({ success: false, error: 'Failed to add blood unit', details: error.message });
    }
});

app.delete('/api/inventory/:id', async (req, res) => {
    try {
        // You might want to update status to 'used' or 'disposed' rather than delete from database
        const deletedUnit = await Inventory.findByIdAndDelete(req.params.id);
        if (!deletedUnit) {
            return res.status(404).json({ success: false, error: 'Blood unit not found.' });
        }
        res.status(200).json({ success: true, message: 'Blood unit deleted successfully.' });
    } catch (error) {
        console.error("Error deleting inventory item:", error);
        res.status(500).json({ success: false, error: 'Failed to delete blood unit', details: error.message });
    }
});


// --- Requests API ---
app.get('/api/requests', async (req, res) => {
    try {
        const requests = await Request.find().sort({ requestDate: -1 });
        res.status(200).json({ success: true, data: requests }); // Consistent response format
    } catch (error) {
        console.error("Error fetching requests:", error);
        res.status(500).json({ success: false, error: 'Failed to fetch requests', details: error.message });
    }
});

app.post('/api/requests', validateRequest, handleValidationErrors, async (req, res) => {
    try {
        const request = new Request(req.body);
        await request.save();
        res.status(201).json({ success: true, message: 'Blood request submitted successfully!', data: request }); // Consistent response format
    } catch (error) {
        console.error("Error creating request:", error);
        res.status(500).json({ success: false, error: 'Failed to submit request', details: error.message });
    }
});

// Custom endpoint for fulfilling/approving requests (used by frontend)
app.put('/api/requests/:id/approve', async (req, res) => {
    try {
        const request = await Request.findById(req.params.id);
        if (!request) {
            return res.status(404).json({ success: false, error: 'Request not found.' });
        }
        if (request.status !== 'pending') {
            return res.status(400).json({ success: false, error: `Request status is ${request.status}. Only pending requests can be approved.` });
        }

        // Check if enough blood is available (simplified, could be more complex with specific units)
        const availableBloodUnits = await Inventory.aggregate([
            { $match: { bloodType: request.bloodType, status: 'available', expiryDate: { $gt: new Date() } } },
            { $group: { _id: null, totalUnits: { $sum: '$units' } } }
        ]);
        const totalAvailable = availableBloodUnits.length > 0 ? availableBloodUnits[0].totalUnits : 0;

        if (totalAvailable < request.units) {
            return res.status(400).json({ success: false, error: `Insufficient ${request.bloodType} blood. Available: ${totalAvailable}, Required: ${request.units}.` });
        }

        // Deduct units from inventory (prioritize by earliest expiry)
        let unitsToDeduct = request.units;
        const inventoryItemsToUpdate = await Inventory.find({
            bloodType: request.bloodType,
            status: 'available',
            expiryDate: { $gt: new Date() }
        }).sort({ expiryDate: 1 }); // Use FIFO based on expiry

        for (const item of inventoryItemsToUpdate) {
            if (unitsToDeduct <= 0) break;

            if (item.units <= unitsToDeduct) {
                // Use the entire batch
                item.status = 'used'; // Mark as used
                unitsToDeduct -= item.units;
                item.updatedAt = new Date();
                await item.save();
            } else {
                // Split the batch: part used, part remains available
                const newUsedBatch = new Inventory({
                    bloodType: item.bloodType,
                    units: unitsToDeduct,
                    donorId: item.donorId,
                    collectionDate: item.collectionDate,
                    expiryDate: item.expiryDate,
                    status: 'used',
                    createdAt: item.createdAt // Keep original creation date for the split
                });
                await newUsedBatch.save();

                item.units -= unitsToDeduct; // Remaining units in the original batch
                item.updatedAt = new Date();
                await item.save();
                unitsToDeduct = 0;
            }
        }

        // Update request status to fulfilled
        request.status = 'fulfilled';
        request.processedBy = 'System'; // Or authenticated user
        request.processedDate = new Date();
        request.updatedAt = new Date();
        await request.save();

        res.status(200).json({ success: true, message: 'Request fulfilled successfully and inventory updated.', data: request });
    } catch (error) {
        console.error("Error fulfilling request:", error);
        res.status(500).json({ success: false, error: 'Failed to fulfill request', details: error.message });
    }
});

// A generic PUT route for requests (could be used for 'cancel' etc. if body specifies status)
app.put('/api/requests/:id', async (req, res) => {
    try {
        const { status } = req.body; // Expecting status to be passed in body
        const request = await Request.findByIdAndUpdate(
            req.params.id,
            { status: status, updatedAt: new Date() }, // Only update status for simplicity
            { new: true, runValidators: true } // Return updated doc, run schema validators
        );
        if (!request) {
            return res.status(404).json({ success: false, error: 'Request not found.' });
        }
        res.status(200).json({ success: true, message: 'Request updated successfully.', data: request });
    } catch (error) {
        console.error("Error updating request:", error);
        res.status(500).json({ success: false, error: 'Failed to update request', details: error.message });
    }
});

app.delete('/api/requests/:id', async (req, res) => {
    try {
        // You might want to update status to 'cancelled' rather than delete from database
        const deletedRequest = await Request.findByIdAndDelete(req.params.id);
        if (!deletedRequest) {
            return res.status(404).json({ success: false, error: 'Request not found.' });
        }
        res.status(200).json({ success: true, message: 'Request deleted successfully.' });
    } catch (error) {
        console.error("Error deleting request:", error);
        res.status(500).json({ success: false, error: 'Failed to delete request', details: error.message });
    }
});


// --- Error Handling Middleware ---
// This handles any errors thrown by route handlers or middleware.
app.use((err, req, res, next) => {
    console.error(err.stack); // Log the full error stack for debugging
    res.status(500).json({
        success: false,
        error: 'An unexpected server error occurred.',
        details: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
});

// --- 404 Not Found Handler ---
// This handles any requests that don't match existing routes.
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `The requested URL ${req.originalUrl} was not found on this server.`,
    });
});


// --- Start Server ---
app.listen(PORT, () => {
    console.log(`🚀 Blood Bank Management Server running on http://localhost:${PORT}`);
    console.log(`🌐 Frontend served from http://localhost:${PORT}/`); // Frontend served directly by this server
    console.log(`🔗 API Base URL: http://localhost:${PORT}/api`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;