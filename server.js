require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { body, validationResult } = require('express-validator');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:5500', 'http://localhost:8080', 'http://127.0.0.1:8080'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
});
app.use('/api/', limiter);

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/bloodbank';
console.log("Mongo URI:", MONGO_URI);

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// MongoDB Schemas
const donorSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    age: { type: Number, required: true, min: 18, max: 65 },
    bloodType: { 
        type: String, 
        required: true, 
        enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] 
    },
    phone: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    address: { type: String, required: true, trim: true },
    lastDonation: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const recipientSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    age: { type: Number, required: true, min: 1, max: 120 },
    bloodType: { 
        type: String, 
        required: true, 
        enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] 
    },
    phone: { type: String, required: true, trim: true },
    hospital: { type: String, required: true, trim: true },
    unitsRequired: { type: Number, required: true, min: 1, max: 10 },
    urgency: { 
        type: String, 
        required: true, 
        enum: ['Low', 'Medium', 'High', 'Critical'] 
    },
    status: { 
        type: String, 
        default: 'pending', 
        enum: ['pending', 'approved', 'rejected', 'fulfilled'] 
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const inventorySchema = new mongoose.Schema({
    bloodType: { 
        type: String, 
        required: true, 
        enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] 
    },
    units: { type: Number, required: true, min: 1 },
    expiryDate: { type: Date, required: true },
    donorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Donor' },
    status: { 
        type: String, 
        default: 'available', 
        enum: ['available', 'reserved', 'used', 'expired'] 
    },
    collectionDate: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const requestSchema = new mongoose.Schema({
    recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Recipient', required: true },
    recipientName: { type: String, required: true },
    bloodType: { 
        type: String, 
        required: true, 
        enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] 
    },
    units: { type: Number, required: true, min: 1 },
    hospital: { type: String, required: true },
    urgency: { 
        type: String, 
        required: true, 
        enum: ['Low', 'Medium', 'High', 'Critical'] 
    },
    status: { 
        type: String, 
        default: 'pending', 
        enum: ['pending', 'approved', 'rejected', 'fulfilled'] 
    },
    notes: { type: String, trim: true },
    processedBy: { type: String, trim: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// Models
const Donor = mongoose.model('Donor', donorSchema);
const Recipient = mongoose.model('Recipient', recipientSchema);
const Inventory = mongoose.model('Inventory', inventorySchema);
const Request = mongoose.model('Request', requestSchema);

// Validation Middleware
const validateDonor = [
    body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters'),
    body('age').isInt({ min: 18, max: 65 }).withMessage('Age must be between 18 and 65'),
    body('bloodType').isIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).withMessage('Invalid blood type'),
    body('phone').trim().isLength({ min: 10, max: 15 }).withMessage('Phone number must be between 10 and 15 characters'),
    body('email').isEmail().normalizeEmail().withMessage('Invalid email address'),
    body('address').trim().isLength({ min: 10, max: 200 }).withMessage('Address must be between 10 and 200 characters')
];

const validateRecipient = [
    body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters'),
    body('age').isInt({ min: 1, max: 120 }).withMessage('Age must be between 1 and 120'),
    body('bloodType').isIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).withMessage('Invalid blood type'),
    body('phone').trim().isLength({ min: 10, max: 15 }).withMessage('Phone number must be between 10 and 15 characters'),
    body('hospital').trim().isLength({ min: 2, max: 100 }).withMessage('Hospital name must be between 2 and 100 characters'),
    body('unitsRequired').isInt({ min: 1, max: 10 }).withMessage('Units required must be between 1 and 10'),
    body('urgency').isIn(['Low', 'Medium', 'High', 'Critical']).withMessage('Invalid urgency level')
];

const validateInventory = [
    body('bloodType').isIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).withMessage('Invalid blood type'),
    body('units').isInt({ min: 1 }).withMessage('Units must be at least 1'),
    body('expiryDate').isISO8601().withMessage('Invalid expiry date format')
];

// Helper Functions
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: errors.array()
        });
    }
    next();
};

const checkBloodCompatibility = (recipientBloodType, donorBloodType) => {
    const compatibility = {
        'A+': ['A+', 'A-', 'O+', 'O-'],
        'A-': ['A-', 'O-'],
        'B+': ['B+', 'B-', 'O+', 'O-'],
        'B-': ['B-', 'O-'],
        'AB+': ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
        'AB-': ['A-', 'B-', 'AB-', 'O-'],
        'O+': ['O+', 'O-'],
        'O-': ['O-']
    };
    
    return compatibility[recipientBloodType]?.includes(donorBloodType) || false;
};

const checkExpiredBlood = async () => {
    const now = new Date();
    await Inventory.updateMany(
        { expiryDate: { $lt: now }, status: 'available' },
        { status: 'expired' }
    );
};

// Routes

// Health Check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        mongodb: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'
    });
});

// Dashboard Stats

app.get('/api/stats', async (req, res) => {
    try {
        await checkExpiredBlood();
        
        const [donors, recipients, inventory, requests] = await Promise.all([
            Donor.countDocuments({ isActive: true }),
            Recipient.countDocuments(),
            Inventory.aggregate([
                { $match: { status: 'available' } },
                { $group: { _id: null, totalUnits: { $sum: '$units' } } }
            ]),
            Request.countDocuments({ status: 'pending' })
        ]);
        
        const totalUnits = inventory.length > 0 ? inventory[0].totalUnits : 0;
        
        res.json({
            success: true,
            data: {
                totalDonors: donors,
                totalRecipients: recipients,
                totalUnits: totalUnits,
                pendingRequests: requests
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to fetch dashboard stats',
            details: error.message
        });
    }
});

// Donors Routes
app.get('/api/donors', async (req, res) => {
    try {
        const donors = await Donor.find({ isActive: true }).sort({ createdAt: -1 });
        res.json(donors);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to fetch donors',
            details: error.message
        });
    }
});

app.post('/api/donors', validateDonor, handleValidationErrors, async (req, res) => {
    try {
        // Check for duplicate email
        const existingDonor = await Donor.findOne({ email: req.body.email });
        if (existingDonor) {
            return res.status(400).json({
                success: false,
                error: 'A donor with this email already exists'
            });
        }
        
        const donor = new Donor(req.body);
        await donor.save();
        
        res.status(201).json({
            success: true,
            message: 'Donor registered successfully',
            data: donor
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to register donor',
            details: error.message
        });
    }
});

app.get('/api/donors/:id', async (req, res) => {
    try {
        const donor = await Donor.findById(req.params.id);
        if (!donor) {
            return res.status(404).json({
                success: false,
                error: 'Donor not found'
            });
        }
        res.json(donor);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to fetch donor',
            details: error.message
        });
    }
});

// Recipients Routes
app.get('/api/recipients', async (req, res) => {
    try {
        const recipients = await Recipient.find().sort({ createdAt: -1 });
        res.json(recipients);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to fetch recipients',
            details: error.message
        });
    }
});

app.post('/api/recipients', validateRecipient, handleValidationErrors, async (req, res) => {
    try {
        const recipient = new Recipient(req.body);
        await recipient.save();
        
        // Auto-create blood request
        const request = new Request({
            recipientId: recipient._id,
            recipientName: recipient.name,
            bloodType: recipient.bloodType,
            units: recipient.unitsRequired,
            hospital: recipient.hospital,
            urgency: recipient.urgency
        });
        await request.save();
        
        res.status(201).json({
            success: true,
            message: 'Recipient registered and blood request created successfully',
            data: recipient
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to register recipient',
            details: error.message
        });
    }
});

// Inventory Routes
app.get('/api/inventory', async (req, res) => {
    try {
        await checkExpiredBlood();
        const inventory = await Inventory.find({ status: 'available' })
            .populate('donorId', 'name bloodType')
            .sort({ createdAt: -1 });
        res.json(inventory);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to fetch inventory',
            details: error.message
        });
    }
});

app.post('/api/inventory', validateInventory, handleValidationErrors, async (req, res) => {
    try {
        const inventory = new Inventory(req.body);
        await inventory.save();
        
        res.status(201).json({
            success: true,
            message: 'Blood units added to inventory successfully',
            data: inventory
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to add blood units to inventory',
            details: error.message
        });
    }
});

// Blood Type Availability
app.get('/api/inventory/availability/:bloodType', async (req, res) => {
    try {
        await checkExpiredBlood();
        const { bloodType } = req.params;
        
        const availability = await Inventory.aggregate([
            { $match: { bloodType: bloodType, status: 'available' } },
            { $group: { _id: null, totalUnits: { $sum: '$units' } } }
        ]);
        
        const totalUnits = availability.length > 0 ? availability[0].totalUnits : 0;
        
        res.json({
            success: true,
            bloodType: bloodType,
            availableUnits: totalUnits,
            status: totalUnits > 10 ? 'available' : totalUnits > 5 ? 'critical' : 'out-of-stock'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to check blood availability',
            details: error.message
        });
    }
});

// Requests Routes
app.get('/api/requests', async (req, res) => {
    try {
        const urgencyOrder = { Critical: 1, High: 2, Medium: 3, Low: 4 };
        const requests = await Request.aggregate([
            {
                $addFields: {
                    urgencyPriority: {
                        $switch: {
                            branches: [
                                { case: { $eq: ['$urgency', 'Critical'] }, then: 1 },
                                { case: { $eq: ['$urgency', 'High'] }, then: 2 },
                                { case: { $eq: ['$urgency', 'Medium'] }, then: 3 },
                                { case: { $eq: ['$urgency', 'Low'] }, then: 4 }
                            ],
                            default: 5
                        }
                    }
                }
            },
            { $sort: { urgencyPriority: 1, createdAt: -1 } }
        ]);
        // Populate recipientId fields manually
        const populatedRequests = await Request.populate(requests, { path: 'recipientId', select: 'name phone hospital' });
        res.json(populatedRequests);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to fetch requests',
            details: error.message
        });
    }
});

app.put('/api/requests/:id/approve', async (req, res) => {
    try {
        const request = await Request.findById(req.params.id);
        if (!request) {
            return res.status(404).json({
                success: false,
                error: 'Request not found'
            });
        }
        
        // Check blood availability
        const availability = await Inventory.aggregate([
            { $match: { bloodType: request.bloodType, status: 'available' } },
            { $group: { _id: null, totalUnits: { $sum: '$units' } } }
        ]);
        
        const availableUnits = availability.length > 0 ? availability[0].totalUnits : 0;
        
        if (availableUnits < request.units) {
            return res.status(400).json({
                success: false,
                error: `Insufficient blood units. Available: ${availableUnits}, Required: ${request.units}`
            });
        }
        
        // Reserve blood units
        let unitsToReserve = request.units;
        const inventoryItems = await Inventory.find({ 
            bloodType: request.bloodType, 
            status: 'available' 
        }).sort({ expiryDate: 1 });
        
        for (const item of inventoryItems) {
            if (unitsToReserve <= 0) break;
            
            if (item.units <= unitsToReserve) {
                item.status = 'reserved';
                unitsToReserve -= item.units;
                await item.save();
            } else {
                // Split the inventory item
                const newItem = new Inventory({
                    bloodType: item.bloodType,
                    units: unitsToReserve,
                    expiryDate: item.expiryDate,
                    donorId: item.donorId,
                    status: 'reserved',
                    collectionDate: item.collectionDate
                });
                await newItem.save();
                
                item.units -= unitsToReserve;
                await item.save();
                unitsToReserve = 0;
            }
        }
        
        request.status = 'approved';
        request.processedBy = 'System Admin';
        request.updatedAt = new Date();
        await request.save();
        
        // Update recipient status
        await Recipient.findByIdAndUpdate(request.recipientId, { 
            status: 'approved',
            updatedAt: new Date()
        });
        
        res.json({
            success: true,
            message: 'Request approved and blood units reserved successfully',
            data: request
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to approve request',
            details: error.message
        });
    }
});

app.put('/api/requests/:id/reject', async (req, res) => {
    try {
        const request = await Request.findById(req.params.id);
        if (!request) {
            return res.status(404).json({
                success: false,
                error: 'Request not found'
            });
        }
        
        request.status = 'rejected';
        request.processedBy = 'System Admin';
        request.notes = req.body.notes || 'Request rejected by admin';
        request.updatedAt = new Date();
        await request.save();
        
        // Update recipient status
        await Recipient.findByIdAndUpdate(request.recipientId, { 
            status: 'rejected',
            updatedAt: new Date()
        });
        
        res.json({
            success: true,
            message: 'Request rejected successfully',
            data: request
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to reject request',
            details: error.message
        });
    }
});

// Blood Compatibility Check
app.get('/api/compatibility/:recipientBloodType/:donorBloodType', (req, res) => {
    const { recipientBloodType, donorBloodType } = req.params;
    const isCompatible = checkBloodCompatibility(recipientBloodType, donorBloodType);
    
    res.json({
        success: true,
        recipientBloodType,
        donorBloodType,
        isCompatible
    });
});

// Search Routes
app.get('/api/search/donors', async (req, res) => {
    try {
        const { bloodType, name } = req.query;
        let query = { isActive: true };
        
        if (bloodType) {
            query.bloodType = bloodType;
        }
        
        if (name) {
            query.name = { $regex: name, $options: 'i' };
        }
        
        const donors = await Donor.find(query).sort({ createdAt: -1 });
        res.json(donors);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to search donors',
            details: error.message
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        error: 'Something went wrong!',
        details: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Route not found'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Blood Bank Management Server running on port ${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}/health`);
    console.log(`🔗 API Base URL: http://localhost:${PORT}/api`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('📤 SIGTERM received, shutting down gracefully');
    mongoose.connection.close(() => {
        console.log('📤 MongoDB connection closed');
        process.exit(0);
    });
});

module.exports = app;