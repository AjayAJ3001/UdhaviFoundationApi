// routes/attendancePayrollRoutes.js
const express = require('express');
const router = express.Router();
const AttendancePayrollController = require('../controller/attendancePayrollController');
const { body, param, query } = require('express-validator');
// Uncomment if you have authentication middleware
// const auth = require('../middleware/auth');

// ==========================================
// VALIDATION RULES
// ==========================================

const salaryConfigValidation = [
    body('booking_id').isInt().withMessage('Booking ID must be an integer'),
    body('service_provider_id').isInt().withMessage('Service provider ID must be an integer'),
    body('customer_id').isInt().withMessage('Customer ID must be an integer'),
    body('monthly_salary').isFloat({ min: 0 }).withMessage('Monthly salary must be a positive number'),
    body('working_days_per_month').optional().isInt({ min: 20, max: 31 }).withMessage('Working days must be between 20 and 31'),
    body('pf_percentage').optional().isFloat({ min: 0, max: 100 }).withMessage('PF percentage must be between 0 and 100'),
    body('pf_enabled').optional().isBoolean().withMessage('PF enabled must be boolean'),
    body('effective_from_date').isISO8601().withMessage('Effective from date must be valid date')
];

const punchInValidation = [
    body('service_provider_id').isInt().withMessage('Service provider ID is required'),
    body('customer_id').isInt().withMessage('Customer ID is required'),
    body('booking_id').isInt().withMessage('Booking ID is required'),
    body('latitude').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude is required'),
    body('longitude').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude is required')
];

const punchOutValidation = [
    body('service_provider_id').isInt().withMessage('Service provider ID is required'),
    body('latitude').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude is required'),
    body('longitude').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude is required')
];

const manualAttendanceValidation = [
    body('service_provider_id').isInt().withMessage('Service provider ID is required'),
    body('customer_id').isInt().withMessage('Customer ID is required'),
    body('booking_id').isInt().withMessage('Booking ID is required'),
    body('attendance_date').isISO8601().withMessage('Valid attendance date is required'),
    body('check_in_time').optional().matches(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/).withMessage('Check-in time must be in YYYY-MM-DD HH:MM:SS format'),
    body('check_out_time').optional().matches(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/).withMessage('Check-out time must be in YYYY-MM-DD HH:MM:SS format'),
    body('status').isIn(['PRESENT', 'ABSENT', 'LATE', 'LEAVE', 'HALF_DAY']).withMessage('Invalid status'),
    body('notes').optional().isString().withMessage('Notes must be a string')
];

const delayValidation = [
    body('service_provider_id').isInt().withMessage('Service provider ID is required'),
    body('attendance_date').isISO8601().withMessage('Valid attendance date is required'),
    body('delay_minutes').isInt({ min: 0 }).withMessage('Delay minutes must be a positive integer'),
    body('notes').isString().withMessage('Notes are required for marking delay')
];

const leaveApplicationValidation = [
    body('service_provider_id').isInt().withMessage('Service provider ID is required'),
    body('customer_id').isInt().withMessage('Customer ID is required'),
    body('booking_id').isInt().withMessage('Booking ID is required'),
    body('leave_type').isIn(['SICK_LEAVE', 'CASUAL_LEAVE', 'EMERGENCY_LEAVE', 'UNPAID_LEAVE', 'PLANNED_LEAVE']).withMessage('Invalid leave type'),
    body('start_date').isISO8601().withMessage('Valid start date is required'),
    body('end_date').isISO8601().withMessage('Valid end date is required'),
    body('reason').isString().isLength({ min: 10 }).withMessage('Reason must be at least 10 characters'),
    body('is_paid').optional().isBoolean().withMessage('is_paid must be boolean')
];

const leaveStatusValidation = [
    param('leave_id').isInt().withMessage('Leave ID must be an integer'),
    body('status').isIn(['APPROVED', 'REJECTED']).withMessage('Status must be APPROVED or REJECTED'),
    body('rejection_reason').optional().isString().withMessage('Rejection reason must be a string')
];

const generatePayrollValidation = [
    body('service_provider_id').isInt().withMessage('Service provider ID is required'),
    body('month').isInt({ min: 1, max: 12 }).withMessage('Month must be between 1 and 12'),
    body('year').isInt({ min: 2020, max: 2100 }).withMessage('Valid year is required')
];

const markPaidValidation = [
    param('payroll_id').isInt().withMessage('Payroll ID must be an integer'),
    body('payment_mode').isIn(['BANK_TRANSFER', 'UPI', 'CASH', 'CHEQUE']).withMessage('Invalid payment mode'),
    body('payment_reference').optional().isString().withMessage('Payment reference must be a string')
];

// ==========================================
// SALARY CONFIGURATION ROUTES
// ==========================================

/**
 * @route   POST /api/attendance-payroll/salary-config
 * @desc    Create or update salary configuration
 * @access  Private (Customer)
 */
router.post('/salary-config', 
    salaryConfigValidation,
    AttendancePayrollController.createSalaryConfig
);

/**
 * @route   GET /api/attendance-payroll/salary-config/:booking_id
 * @desc    Get salary configuration by booking ID
 * @access  Private
 */
router.get('/salary-config/:booking_id',
    param('booking_id').isInt().withMessage('Booking ID must be an integer'),
    AttendancePayrollController.getSalaryConfig
);

// ==========================================
// ATTENDANCE ROUTES
// ==========================================

/**
 * @route   POST /api/attendance-payroll/punch-in
 * @desc    Customer marks service provider check-in with location
 * @access  Private (Customer)
 */
router.post('/punch-in',
    punchInValidation,
    AttendancePayrollController.punchIn
);

/**
 * @route   POST /api/attendance-payroll/punch-out
 * @desc    Customer marks service provider check-out with location
 * @access  Private (Customer)
 */
router.post('/punch-out',
    punchOutValidation,
    AttendancePayrollController.punchOut
);

/**
 * @route   POST /api/attendance-payroll/manual-attendance
 * @desc    Manual attendance entry for missed punch in/out
 * @access  Private (Customer)
 */
router.post('/manual-attendance',
    manualAttendanceValidation,
    AttendancePayrollController.manualAttendance
);

/**
 * @route   PUT /api/attendance-payroll/mark-delay
 * @desc    Mark delay with notes and time
 * @access  Private (Customer)
 */
router.put('/mark-delay',
    delayValidation,
    AttendancePayrollController.markDelay
);

/**
 * @route   GET /api/attendance-payroll/attendance/:service_provider_id/:date
 * @desc    Get attendance for a specific date
 * @access  Private
 */
router.get('/attendance/:service_provider_id/:date',
    param('service_provider_id').isInt().withMessage('Service provider ID must be an integer'),
    param('date').isISO8601().withMessage('Valid date is required'),
    AttendancePayrollController.getAttendanceByDate
);

/**
 * @route   GET /api/attendance-payroll/monthly-attendance/:service_provider_id/:month/:year
 * @desc    Get monthly attendance for a service provider
 * @access  Private
 */
router.get('/monthly-attendance/:service_provider_id/:month/:year',
    param('service_provider_id').isInt().withMessage('Service provider ID must be an integer'),
    param('month').isInt({ min: 1, max: 12 }).withMessage('Month must be between 1 and 12'),
    param('year').isInt({ min: 2020 }).withMessage('Valid year is required'),
    AttendancePayrollController.getMonthlyAttendance
);

/**
 * @route   GET /api/attendance-payroll/customer-attendance/:customer_id/:month/:year
 * @desc    Get all service providers attendance for a customer
 * @access  Private (Customer)
 */
router.get('/customer-attendance/:customer_id/:month/:year',
    param('customer_id').isInt().withMessage('Customer ID must be an integer'),
    param('month').isInt({ min: 1, max: 12 }).withMessage('Month must be between 1 and 12'),
    param('year').isInt({ min: 2020 }).withMessage('Valid year is required'),
    AttendancePayrollController.getCustomerAttendance
);

// ==========================================
// LEAVE MANAGEMENT ROUTES
// ==========================================

/**
 * @route   POST /api/attendance-payroll/apply-leave
 * @desc    Apply for leave
 * @access  Private (Service Provider or Customer)
 */
router.post('/apply-leave',
    leaveApplicationValidation,
    AttendancePayrollController.applyLeave
);

/**
 * @route   PUT /api/attendance-payroll/leave/:leave_id/status
 * @desc    Approve or reject leave
 * @access  Private (Customer)
 */
router.put('/leave/:leave_id/status',
    leaveStatusValidation,
    AttendancePayrollController.updateLeaveStatus
);

/**
 * @route   GET /api/attendance-payroll/leave-history/:service_provider_id
 * @desc    Get leave history for a service provider
 * @access  Private
 */
router.get('/leave-history/:service_provider_id',
    param('service_provider_id').isInt().withMessage('Service provider ID must be an integer'),
    query('status').optional().isIn(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).withMessage('Invalid status'),
    AttendancePayrollController.getLeaveHistory
);

/**
 * @route   GET /api/attendance-payroll/pending-leaves/:customer_id
 * @desc    Get pending leaves for a customer
 * @access  Private (Customer)
 */
router.get('/pending-leaves/:customer_id',
    param('customer_id').isInt().withMessage('Customer ID must be an integer'),
    AttendancePayrollController.getPendingLeaves
);

// ==========================================
// PAYROLL ROUTES
// ==========================================

/**
 * @route   POST /api/attendance-payroll/generate-payroll
 * @desc    Generate monthly payroll for a service provider
 * @access  Private (Customer or Admin)
 */
router.post('/generate-payroll',
    generatePayrollValidation,
    AttendancePayrollController.generatePayroll
);

/**
 * @route   GET /api/attendance-payroll/payroll/:payroll_id
 * @desc    Get payroll by ID (includes details for payslip)
 * @access  Private
 */
router.get('/payroll/:payroll_id',
    param('payroll_id').isInt().withMessage('Payroll ID must be an integer'),
    AttendancePayrollController.getPayrollById
);

// /**
//  * @route   GET /api/attendance-payroll/payrolls/:service_provider_id
//  * @desc    Get all payrolls for a service provider
//  * @access  Private (Service Provider)
//  */
// router.get('/payrolls/:service_provider_id',
//     param('service_provider_id').isInt().withMessage('Service provider ID must be an integer'),
//     AttendancePayrollController.getServiceProviderPayrolls
// );

/**
 * @route   GET /api/attendance-payroll/customer-payrolls/:customer_id
 * @desc    Get payrolls for all service providers of a customer
 * @access  Private (Customer)
 */
router.get('/customer-payrolls/:customer_id',
    param('customer_id').isInt().withMessage('Customer ID must be an integer'),
    query('month').optional().isInt({ min: 1, max: 12 }).withMessage('Month must be between 1 and 12'),
    query('year').optional().isInt({ min: 2020 }).withMessage('Valid year is required'),
    AttendancePayrollController.getCustomerPayrolls
);

/**
 * @route   PUT /api/attendance-payroll/payroll/:payroll_id/mark-paid
 * @desc    Mark payroll as paid
 * @access  Private (Customer)
 */
router.put('/payroll/:payroll_id/mark-paid',
    markPaidValidation,
    AttendancePayrollController.markPayrollPaid
);

/**
 * @route   GET /api/attendance-payroll/pending-payrolls
 * @desc    Get all pending payrolls
 * @access  Private
 */
router.get('/pending-payrolls',
    query('customer_id').optional().isInt().withMessage('Customer ID must be an integer'),
    AttendancePayrollController.getPendingPayrolls
);

/**
 * @route   GET /api/attendance-payroll/dashboard/:customer_id
 * @desc    Get payroll dashboard with statistics
 * @access  Private (Customer)
 */
router.get('/dashboard/:customer_id',
    param('customer_id').isInt().withMessage('Customer ID must be an integer'),
    AttendancePayrollController.getPayrollDashboard
);

/**
 * @route   GET /api/attendance-payroll/leaves/all
 * @desc    Get all leaves with filters - MANAGE LEAVE SCREEN
 * @access  Private
 */
router.get(
    '/leaves/all',
    [
        query('status').optional().isIn(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']),
        query('customer_id').optional().isInt(),
        query('search').optional().isString()
    ],
    AttendancePayrollController.getAllLeaves
);

/**
 * @route   GET /api/attendance-payroll/attendances/all
 * @desc    Get all attendances with filters - MANAGE ATTENDANCE SCREEN
 * @access  Private
 */
router.get(
    '/attendances/all',
    [
        query('status').optional().isIn(['PRESENT', 'ABSENT', 'LATE', 'LEAVE', 'HALF_DAY']),
        query('customer_id').optional().isInt(),
        query('date').optional().isDate(),
        query('month').optional().isInt({ min: 1, max: 12 }),
        query('year').optional().isInt({ min: 2000, max: 2100 }),
        query('search').optional().isString()
    ],
    AttendancePayrollController.getAllAttendances
);

// ==========================================
// MOVE THIS UP (around line 240)
// ==========================================

/**
 * @route   GET /api/attendance-payroll/payrolls/all
 * @desc    Get all payrolls with filters - MANAGE PAYROLL SCREEN
 * @access  Private
 */
router.get(
    '/payrolls/all',  // ⬅️ Specific route MUST come first!
    [
        query('status').optional().isIn(['PAID', 'PENDING', 'ON-HOLD', 'CANCELLED']),
        query('month').optional().isInt({ min: 1, max: 12 }),
        query('year').optional().isInt({ min: 2000, max: 2100 }),
        query('customer_id').optional().isInt(),
        query('search').optional().isString()
    ],
    AttendancePayrollController.getAllPayrolls
);

/**
 * @route   GET /api/attendance-payroll/payroll/all/details
 * @desc    Get ALL payroll records with complete details from sp_payroll table
 * @access  Private
 * @returns All payroll records with employee, customer, salary, payment details + summary
 */
router.get('/payroll/all/details', AttendancePayrollController.getAllPayrollData);


/**
 * @route   GET /api/attendance-payroll/payrolls/:service_provider_id
 * @desc    Get all payrolls for a service provider
 * @access  Private (Service Provider)
 */
router.get('/payrolls/:service_provider_id',  // ⬅️ Parameterized route comes after
    param('service_provider_id').isInt().withMessage('Service provider ID must be an integer'),
    AttendancePayrollController.getServiceProviderPayrolls
);

/**
 * @route   GET /api/attendance-payroll/payroll/:id/details
 * @desc    Get complete payroll details - PAYROLL DETAILS SCREEN
 * @access  Private
 */
router.get(
    '/payroll/:id/details',
    [
        param('id').isInt()
    ],
    AttendancePayrollController.getPayrollDetails
);

// ==========================================
// EXPORT ROUTES
// ==========================================

/**
 * @route   GET /api/attendance-payroll/leaves/export
 * @desc    Export all leaves data
 * @access  Private
 */
router.get(
    '/leaves/export',
    AttendancePayrollController.exportLeaves
);

/**
 * @route   GET /api/attendance-payroll/attendances/export
 * @desc    Export all attendances data
 * @access  Private
 */
router.get(
    '/attendances/export',
    [
        query('month').optional().isInt({ min: 1, max: 12 }),
        query('year').optional().isInt({ min: 2000, max: 2100 })
    ],
    AttendancePayrollController.exportAttendances
);

/**
 * @route   GET /api/attendance-payroll/payrolls/export
 * @desc    Export all payrolls data
 * @access  Private
 */
router.get(
    '/payrolls/export',
    [
        query('month').optional().isInt({ min: 1, max: 12 }),
        query('year').optional().isInt({ min: 2000, max: 2100 })
    ],
    AttendancePayrollController.exportPayrolls
);

/**
 * @route   GET /api/attendance-payroll/payroll/1/details
 * @desc    Get ALL payroll records with complete details
 * @access  Private
 */
// ✅ CORRECT - Use AttendancePayrollController which you already have
router.get('/payroll/1/details', AttendancePayrollController.getAllPayrollData);



/**
 * Health check endpoint
 */
router.get('/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Payroll API is running',
        timestamp: new Date().toISOString()
    });
});


module.exports = router;