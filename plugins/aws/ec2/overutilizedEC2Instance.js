var async = require('async');
var helpers = require('../../../helpers/aws');

module.exports = {
    title: 'EC2 CPU Alarm Threshold Exceeded',
    category: 'EC2',
    domain: 'Compute',
    description: 'Identify EC2 instances that have exceeded the alarm threshold for CPU utilization.',
    more_info: 'Excessive CPU utilization can indicate performance issues or the need for capacity optimization.',
    link: 'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/using-cloudwatch.html',
    recommended_action: 'Investigate the cause of high CPU utilization and consider optimizing or scaling resources.',
    apis: ['EC2:describeInstances', 'CloudWatch:getEc2MetricStatistics'],

    run: function(cache, settings, callback) {
        var results = [];
        var source = {};
        var regions = helpers.regions(settings);

        var cpuThreshold = 90;

        async.each(regions.ec2, function(region, rcb) {
            var describeInstances = helpers.addSource(cache, source,
                ['ec2', 'describeInstances', region]);

            if (!describeInstances) return rcb();

            if (describeInstances.err || !describeInstances.data) {
                helpers.addResult(
                    results, 3,
                    `Unable to query for EC2 instances: ${helpers.addError(describeInstances)}`, region);
                return rcb();
            }

            if (!describeInstances.data.length) {
                helpers.addResult(results, 0, 'No EC2 instances found', region);
                return rcb();
            }

            describeInstances.data.forEach(reservation => {
                reservation.Instances.forEach(instance => {
                    if (!instance.InstanceId) return;

                    var resource = instance.InstanceId;
                    var getMetricStatistics = helpers.addSource(cache, source,
                        ['cloudwatch', 'getEc2MetricStatistics', region, instance.InstanceId]);

                    if (!getMetricStatistics || getMetricStatistics.err ||
            !getMetricStatistics.data || !getMetricStatistics.data.Datapoints) {
                        helpers.addResult(results, 3,
                            `Unable to query for CPU metric statistics: ${helpers.addError(getMetricStatistics)}`, region, resource);
                        return;
                    }

                    if (!getMetricStatistics.data.Datapoints.length) {
                        helpers.addResult(results, 0,
                            'CPU metric statistics are not available', region, resource);
                    } else {
                        var cpuDatapoints = getMetricStatistics.data.Datapoints;
                        var cpuUtilization = cpuDatapoints[cpuDatapoints.length - 1].Average;
                        if (cpuUtilization > cpuThreshold) {
                            helpers.addResult(results, 2,
                                `CPU threshold exceeded - Current CPU utilization: ${cpuUtilization}%`, region, resource);
                        } else {
                            helpers.addResult(results, 0,
                                `CPU threshold not exceeded - Current CPU utilization: ${cpuUtilization}%`, region, resource);
                        }
                    }
                });
            });

            rcb();
        }, function() {
            callback(null, results, source);
        });
    }
};
