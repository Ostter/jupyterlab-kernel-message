import * as moment from "moment";

// defaults, overridden by server's config
const options = {
  clear_timings_on_clear_output: false,
  clear_timings_on_kernel_restart: false,
  default_kernel_to_utc: true,
  display_absolute_format: "HH:mm:ss YYYY-MM-DD",
  display_absolute_timings: true,
  display_in_utc: false,
  display_right_aligned: false,
  highlight: {
    use: true,
    color: "#00bb00"
  },
  relative_timing_update_period: 10,
  template: "executed in ${duration}, finished ${end_time}"
};

export function getTimeMessage(startTime, endTime) {
  const start_time = moment(startTime);
  let msg = options.template;
  if (endTime) {
    const end_time = moment(endTime);
    msg = msg.replace("${end_time}", format_moment(end_time));
    const exec_time = -start_time.diff(end_time);
    msg = msg.replace("${duration}", humanized_duration(exec_time));
  }
  return msg;
}
export function compareTo(executeTime, lastTime) {
  const execute_time = moment(executeTime);
  const last_time = moment(lastTime);
  return execute_time > last_time;
}

function format_moment(when) {
  if (options.display_in_utc) {
    when.utc();
  }
  if (options.display_absolute_timings) {
    return when.format(options.display_absolute_format);
  }
  return when.fromNow();
}

function humanized_duration(duration_ms) {
  if (duration_ms < 1000) {
    // < 1s, show ms directly
    return Math.round(duration_ms) + "ms";
  }

  let humanized = "";

  const days = Math.floor(duration_ms / 86400000);
  if (days) {
    humanized += days + "d ";
  }
  duration_ms %= 86400000;

  const hours = Math.floor(duration_ms / 3600000);
  if (days || hours) {
    humanized += hours + "h ";
  }
  duration_ms %= 3600000;

  const mins = Math.floor(duration_ms / 60000);
  if (days || hours || mins) {
    humanized += mins + "m";
  }
  duration_ms %= 60000;

  const secs = duration_ms / 1000; // don't round!
  if (!days) {
    const decimals = hours || mins > 1 ? 0 : secs > 10 ? 1 : 2;
    humanized += (humanized ? " " : "") + secs.toFixed(decimals) + "s";
  }

  return humanized;
}
