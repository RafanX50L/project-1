const dashboard = async (req, res) => {
    try {
        const { reportRange, startDate, endDate } = req.query;
        let page = parseInt(req.query.page) || 1;

        page = Math.max(page, 1);

        let filterCriteria = {};

        if (reportRange === '7days') {
            const dateLimit = new Date();
            dateLimit.setDate(dateLimit.getDate() - 7);
            filterCriteria.createdAt = { $gte: dateLimit };
        } else if (reportRange === 'today') {
            const startOfToday = new Date();
            startOfToday.setHours(0, 0, 0, 0); 
            const endOfToday = new Date();
            endOfToday.setHours(23, 59, 59, 999); 
            filterCriteria.createdAt = { $gte: startOfToday, $lte: endOfToday };
        } else if (reportRange === '1month') {
            const dateLimit = new Date();
            dateLimit.setMonth(dateLimit.getMonth() - 1);
            filterCriteria.createdAt = { $gte: dateLimit };
        } else if (reportRange === '3months') {
            const dateLimit = new Date();
            dateLimit.setMonth(dateLimit.getMonth() - 3);
            filterCriteria.createdAt = { $gte: dateLimit };
        } else if (startDate && endDate) {
            filterCriteria.createdAt = { 
                $gte: new Date(startDate), 
                $lte: new Date(endDate) 
            };
        }

        const recordsPerPage = 5;
        const skip = (page - 1) * recordsPerPage;

        const orders = await Orders.find(filterCriteria)
            .populate('userId', 'name')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(recordsPerPage);

        const totalOrders = await Orders.countDocuments(filterCriteria);
        const totalPages = Math.ceil(totalOrders / recordsPerPage);

        if (page > totalPages && totalPages > 0) {
            return res.redirect(`?page=${totalPages}&reportRange=${reportRange}&startDate=${startDate}&endDate=${endDate}`);
        }

        let totalRevenue = 0;
        let totalSales = 0;
        let totalDiscount = 0;

        orders.forEach((order) => {
            if (order.status === 'delivered') {
                totalRevenue += order.totalAmount;
                totalDiscount += (order.Coupon_discount + order.Offer_discount);
                totalSales++;
            }
        });

        res.render('admin/index.ejs', {
            totalDiscount, totalRevenue, totalSales, orders, 
            currentPage: page, totalPages, reportRange, startDate, endDate
        });

    } catch (error) {
        console.log(error);
        res.status(500).send('Server error');
    }
};