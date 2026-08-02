// Version: 2
// Supports filter event and suffixes

const queryString = window.location.search;
const params = new URLSearchParams(queryString);

const teiId = params.get("teiId");
const enrollmentId = params.get("enrollmentId");
const programId = params.get("programId");
const orgUnitId = params.get("orgUnitId");
const cardId = params.get("cardId");
const eventId = params.get("eventId");
let systemId = null;

window.onload = function () {
	loadDataInCard();
};

async function loadDataInCard() {
	try {
		// Gather enrollmentData
		const url =
			"../../../api/tracker/enrollments/" + enrollmentId + "?fields=*";
		const enrollmentData = await fetchJSON(url);

		// Split attributes and events
		const events = enrollmentData.events;
		const attributes = enrollmentData.attributes;
		systemId = enrollmentData.attributes.find((a) => a.attribute == 'q3NpuWzGvso').value;
		
		// If an explicit eventId is present in the querystring, fetch that single event.
		// When set, it overrides the "today's events" / "full history" logic below and
		// every section resolves its event placeholders against this one event only.
		let explicitEvent = null;
		if (eventId) {
			console.log("Explicit eventId supplied, fetching event: " + eventId);
			const explicitEventUrl =
				"../../../api/tracker/events/" + eventId + "?fields=*";
			explicitEvent = await fetchJSON(explicitEventUrl);
		}

		const meUrl =
			"../../../api/me.json?fields=username,firstName,surname,phoneNumber,email,jobTitle,organisationUnits[id,name,shortName,displayName]";
		const me = await fetchJSON(meUrl);

		const ouUrl =
			"../../../api/organisationUnits/" +
			orgUnitId +
			"?fields=id,name,displayName,code,parent[id,name,displayName,code,parent[id,name,displayName,code,parent[id,name,displayName,code,parent[id,name,displayName,code]]]]";
		const orgUnit = await fetchJSON(ouUrl);
		var optionSetCollection = {};

		// HTML element to render card inside
		const parentElement = document.getElementById("card");

		console.log("Getting card config");
		const cardConfig = await fetchJSON(
			"../../../api/dataStore/cardDesigner/" + cardId,
		);
		const cardToRender = cardConfig;

		// if cardConfig has path
		if (cardToRender.path) {
			window.location.replace(
				"../../../api/apps/Patient-Cards/" +
					cardToRender.path +
					"?teiId=" +
					teiId +
					"&enrollmentId=" +
					enrollmentId +
					"&programId=" +
					programId +
					"&orgUnitId=" +
					orgUnitId,
			);
		}

		console.log("Preparing optionSet collection");

		const optionSets = cardToRender.optionSets || {};
		const promises = Object.keys(optionSets).map((dataElementId) => {
			const optionSetId = optionSets[dataElementId];
			if (!optionSetId) return Promise.resolve();
			const url =
				"../../../api/optionSets/" + optionSetId + "?fields=options[code,name]";
			return fetch(url)
				.then((res) => res.json())
				.then((data) => {
					optionSetCollection[dataElementId] = data.options || [];
				});
		});

		Promise.all(promises).then(() => {
			console.log("Preparing card: " + cardToRender.name);
			var cardSections = cardToRender.sections;
			
			var cardHtmlString = "";
			const regex = /\{.+?\}/g;

			// Tracks every placeholder that actually resolved to a real value, across all
			// sections. Used afterwards to decide whether to keep or drop [[suffix:...]] text.
			const resolvedPlaceholders = new Set();

			// Chooses which event(s) a section should pull placeholder values from.
			// - explicitEvent (via ?eventId=) always wins, for both single and repeatable sections.
			// - otherwise 'today' mode (single sections) filters to events dated today.
			// - otherwise 'history' mode (repeatable sections) returns the full filtered history.
			function getFilteredEvents(section, mode) {
				if (explicitEvent) return [explicitEvent];
				if (!events) return [];
				
				if (mode === "today") {
					const formattedDate = new Date().toISOString().split("T")[0];
					return events.filter(
						(ev) => (!section.programStage || ev.programStage == section.programStage) && ev.occurredAt.substring(0, 10) === formattedDate,
					);
				}
				
				return section.programStage ? events.filter((ev) => ev.programStage == section.programStage) : events;
			}

			cardSections.forEach((section) => {
				console.log("Processing card section.");
				var roughHtmlHeader = section.htmlHeader;
				const htmlHeader = roughHtmlHeader != undefined ? roughHtmlHeader.replace(/<\/tbody>\s*<\/table>\s*$/, "") : "";

				var roughHtmlFooter = section.htmlFooter;
				const htmlFooter = roughHtmlFooter ? roughHtmlFooter.replace(/^\s*<table[^>]*>\s*<tbody>/, "") : "";

				if (section.type == "single") {
					var htmlBody = section.htmlBody;
					const valuePlaceholders = htmlBody.match(regex) || [];

					valuePlaceholders.forEach((placeholder) => {
						let key = placeholder.replace(/[{}]/g, "").split(".")[0];
						let valueKey = placeholder.replace(/[{}]/g, "").split(".")[1];
						let value;
						let attr = attributes.find((a) => a.attribute == key);

						// Replace placeholders where it matches attributes
						if (attr) {
							if (Object.hasOwn(optionSetCollection, attr.attribute)) {
								const option = optionSetCollection[attr.attribute]?.find(
									(opt) => opt.code === attr.value,
								);
								const name = option ? option.name : null;

								if (!valueKey || valueKey == "value") {
									value = name;
								} else {
									value = attr[valueKey];
								}
							} else {
								if (!valueKey) {
									valueKey = "value";
								}
								if (valueKey == "occurredAt" || valueKey == "enrolledAt") {
									value = enrollmentData[valueKey];
								} else {
									value = attr[valueKey];
								}
							}

							if (isDate(value)) {
								value = NepaliFunctions.AD2BS(value.split("T")[0], "YYYY-MM-DD") + " (" + value.split("T")[0] + ")";
							}

							if (value && value != undefined) {
								console.log(placeholder + " => " + value);
								resolvedPlaceholders.add(placeholder);
								htmlBody = htmlBody.replaceAll(placeholder, value);
							}
						}

						// Replace placeholders where it matches event/dataValues
						const mode = section.mode ? section.mode : "history";
						const filteredEvents = getFilteredEvents(section, mode);

						filteredEvents.forEach((event) => {
							
							let eventValue;

							if (key === "event") {
								eventValue = !valueKey ? event["status"] : event[valueKey];
							} else {
								// filter datavalues with dataElement ID
								let dataValue = event.dataValues.find((dv) => dv.dataElement == key);
								
								if (dataValue) {
									// Check if dataElement key exists in optionSetCollection
									if (Object.hasOwn(optionSetCollection, dataValue.dataElement)) {
										const option = optionSetCollection[dataValue.dataElement]?.find((opt) => opt.code === dataValue.value);
										const name = option ? option.name : null;
										if (!valueKey || valueKey == "value") {
											eventValue = name;
										} else {
											eventValue = dataValue[valueKey];
										}
									} else {
										let dvKey = valueKey || "value";
										if (dvKey == "occurredAt" || dvKey == "enrolledAt") {
											eventValue = event[dvKey];
										} else {
											eventValue = dataValue[dvKey];
										}
									}
								}
							}
							
							if (isDate(eventValue)) {
								eventValue = NepaliFunctions.AD2BS(eventValue.split("T")[0], "YYYY-MM-DD") + " (" + eventValue.split("T")[0] + ")";
							}
							
							if (eventValue) {
								resolvedPlaceholders.add(placeholder);
								console.log(placeholder + " => " + eventValue);
								htmlBody = htmlBody.replaceAll(placeholder, eventValue);
							}
						});

						// Replace {me.xxx} / {provider.xxx} placeholders with logged-in user info
						if (key === "me" || key === "provider") {
							const meKey = valueKey || "username";
							value = me[meKey];
							if (value) {
								console.log(placeholder + " => " + value);
								resolvedPlaceholders.add(placeholder);
								htmlBody = htmlBody.replaceAll(placeholder, value);
							}
						}

						// Legacy support: bare placeholders matching a top-level me.json field directly,
						// e.g. {firstName} instead of {me.firstName}
						if (Object.keys(me).length != 0 && key !== "me" && key !== "provider") {
							value = me[key];
							if (value) {
								htmlBody = htmlBody.replaceAll(placeholder, value);
								resolvedPlaceholders.add(placeholder);
							}
						}

						// Replace Organisation Unit placeholders (kept in its own variables so it
						// can't be contaminated by valueKey/value mutations from the blocks above)
						let ouValueKey = valueKey || "displayName";
						let ouValue;
						if (key === "ou6") {
							ouValue = orgUnit[ouValueKey];
						} else if (key === "ou5") {
							ouValue = orgUnit.parent[ouValueKey];
						} else if (key === "ou4") {
							ouValue = orgUnit.parent.parent[ouValueKey];
						} else if (key === "ou3") {
							ouValue = orgUnit.parent.parent.parent[ouValueKey];
						} else if (key === "ou2") {
							ouValue = orgUnit.parent.parent.parent.parent[ouValueKey];
						}
						if (ouValue && ouValue != undefined) {
							console.log(placeholder + " => " + ouValue);
							resolvedPlaceholders.add(placeholder);
							htmlBody = htmlBody.replaceAll(placeholder, ouValue);
						}
					});

					cardHtmlString += htmlHeader + htmlBody + htmlFooter;
				}

				if (section.type == "repeatable") {
					var fullHtml = "";
					const filteredEvents = getFilteredEvents(section, "history");

					filteredEvents.forEach((event) => {
						const completeHtmlBody = section.htmlBody;

						// Strip off the table tags from the htmlBody
						var htmlBody = completeHtmlBody
							.replace(/^\s*<table[^>]*>\s*<tbody>/, "")
							.replace(/<\/tbody>\s*<\/table>\s*$/, "");
						//console.log(htmlBody);

						const regex = /\{.+?\}/g;
						const valuePlaceholders = htmlBody.match(regex) || [];

						valuePlaceholders.forEach((placeholder) => {
							//console.log(placeholder);
							let key = placeholder.replace(/[{}]/g, "").split(".")[0];
							let valueKey = placeholder.replace(/[{}]/g, "").split(".")[1];
							let value;
							if (key === "event") {
								value = !valueKey ? event["status"] : event[valueKey];
								resolvedPlaceholders.add(placeholder);
								htmlBody = htmlBody.replaceAll(placeholder, value);
							} else {
								// filter datavalues with dataElement ID
								let dataValue = event.dataValues.find((dv) => dv.dataElement == key,);

								if (dataValue) {
									// Check if dataElement key exists in optionSetCollection
									if (Object.hasOwn(optionSetCollection, dataValue.dataElement)) {
										const option = optionSetCollection[dataValue.dataElement]?.find((opt) => opt.code === dataValue.value);
										const name = option ? option.name : null;
										if (!valueKey || valueKey == "value") {
											value = name;
										} else {
											value = dataValue[valueKey];
										}

										if (isDate(value)) {
											value = NepaliFunctions.AD2BS(value.split("T")[0], "YYYY-MM-DD") + " (" + value.split("T")[0] + ")";
										}

										resolvedPlaceholders.add(placeholder);
										htmlBody = htmlBody.replaceAll(placeholder, value);
									} else {
										let dvKey = valueKey || "value";
										value = dataValue[dvKey];

										if (isDate(value)) {
											value = NepaliFunctions.AD2BS(value.split("T")[0], "YYYY-MM-DD") + " (" + value.split("T")[0] + ")";
										}
										
										resolvedPlaceholders.add(placeholder);
										htmlBody = htmlBody.replaceAll(placeholder, value);
									}
								} else {
									htmlBody = htmlBody.replaceAll(placeholder, "NA");
								}
							}
						});
						fullHtml += htmlBody;
					});
					cardHtmlString += htmlHeader + fullHtml + htmlFooter;
				}

				if (section.type != "repeatable" && section.type != "single") {
					console.log("Section type is not valid");
				}
			});

			// Resolve [[suffix:key.valueKey:suffix text]] markers embedded in card templates.
			// Type these directly as plain text in the Card Designer, same way {key.attr}
			// tokens are typed. The suffix text is kept only if its associated placeholder
			// (e.g. "ANC1.value" for {ANC1.value}) actually resolved to a value somewhere above;
			// otherwise it's dropped along with the (now-empty) placeholder.
			const suffixRegex = /\[\[suffix:([^:\]]+):(.*?)\]\]/g;
			cardHtmlString = cardHtmlString.replace(
				suffixRegex,
				(match, key, text) => {
					return resolvedPlaceholders.has("{" + key + "}") ? text : "";
				},
			);

			// clean placeholders that were not replaced with real values
			const placeholdersToClean = cardHtmlString.match(regex) || [];
			placeholdersToClean.forEach((placeholder) => {
				cardHtmlString = cardHtmlString.replaceAll(placeholder, "");
			});

			parentElement.innerHTML = cardHtmlString;
			// load QR if required
			loadQR();
		});
	} catch (e) {
		console.log("Error: " + e.message);
		console.error(e);
	}
}

async function getOuInfo(ouId) {}

async function loadQR() {
	new QRCode(document.getElementById("qrcode"), {
		text: systemId,
		width: 65,
		height: 65,
	});
}

async function fetchJSON(url) {
	const res = await fetch(url);
	if (!res.ok) throw new Error("DHIS2 API fetch failed");
	return res.json();
}

function isDate(value) {
	value = value ? value.substring(0, 10) : "";
	return /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(new Date(value).getTime());
}
